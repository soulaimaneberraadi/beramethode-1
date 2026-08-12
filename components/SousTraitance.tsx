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
  Printer, CheckSquare, Clock, ShieldCheck, ClipboardCheck, Sparkles, Send, Copy, Coins,
  Users, Building2, EyeOff, LayoutGrid, FileText, Settings, ArrowRight, Star, ChevronRight,
  AlertTriangle
} from 'lucide-react';

interface SousTraitanceProps {
  models: ModelData[];
  setModels?: React.Dispatch<React.SetStateAction<ModelData[]>>;
  settings?: any;
  onNavigate?: (view: string) => void;
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

/** Pastille d'un jalon logistique (tissu, fournitures, fiche technique, proto).
 *  Ces quatre états n'ont plus d'onglet dans le formulaire : la pastille est le
 *  seul contrôle, sur la carte comme dans la fiche. `size` distingue la version
 *  compacte de la liste de celle, plus grande, de la fiche détaillée. */
const MILESTONE_TONES = {
  emerald: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
  blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50',
  purple: 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/50',
} as const;

const MilestoneChip: React.FC<{
  label: string;
  title: string;
  icon: React.ReactNode;
  on: boolean;
  tone: keyof typeof MILESTONE_TONES;
  size?: 'sm' | 'md';
  onToggle: () => void;
}> = ({ label, title, icon, on, tone, size = 'sm', onToggle }) => (
  <button
    type="button"
    aria-pressed={on}
    title={title}
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
    className={`font-bold rounded border flex items-center gap-1 transition-colors cursor-pointer hover:brightness-95 dark:hover:brightness-125 ${
      size === 'sm' ? 'text-[8px] px-1.5 py-1' : 'text-[10px] px-2.5 py-1.5'
    } ${on ? MILESTONE_TONES[tone] : 'bg-slate-50 dark:bg-dk-bg text-slate-400 dark:text-dk-muted border-slate-200 dark:border-dk-border'}`}
  >
    {icon}
    {label}
  </button>
);

const KNOWN_COLOR_KEYWORDS: Record<string, string> = {
  'blanc': '#ffffff', 'white': '#ffffff', 'noir': '#1e1e1e', 'black': '#1e1e1e',
  'rouge': '#dc2626', 'red': '#dc2626', 'bleu': '#2563eb', 'blue': '#2563eb',
  'vert': '#16a34a', 'green': '#16a34a', 'jaune': '#eab308', 'yellow': '#eab308',
  'gris': '#6b7280', 'grey': '#6b7280', 'gray': '#6b7280', 'rose': '#ec4899', 'pink': '#ec4899',
  'orange': '#f97316', 'violet': '#7c3aed', 'purple': '#7c3aed', 'marron': '#78350f', 'brown': '#78350f',
  'beige': '#d6c7a1', 'marine': '#1e3a8a', 'navy': '#1e3a8a', 'emeraude': '#059669', 'émeraude': '#059669',
  'turquoise': '#14b8a6', 'kaki': '#6b7f3a', 'bordeaux': '#7f1d1d', 'doré': '#ca8a04', 'or': '#ca8a04', 'argenté': '#9ca3af',
};

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

function colorNameToHex(name: string): string {
  const lower = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const found = Object.entries(KNOWN_COLOR_KEYWORDS).find(([kw]) => lower.includes(kw.normalize('NFD').replace(/[̀-ͯ]/g, '')));
  if (found) return found[1];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

export default function SousTraitance({ models, setModels, settings, onLoadModel, onNavigate }: SousTraitanceProps) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'orders' | 'subcontractors' | 'stock'>('orders');
  const [selectedSubcontractorName, setSelectedSubcontractorName] = useState<string | null>(null);
  const [subSearchQuery, setSubSearchQuery] = useState('');
  const [modelInfoTarget, setModelInfoTarget] = useState<ModelData | null>(null);

  // Core Data States
  const [orders, setOrders] = useState<SubcontractOrder[]>([]);
  const [groups, setGroups] = useState<SubcontractorGroup[]>([]);
  const [subcontractorProfiles, setSubcontractorProfiles] = useState<SubcontractorProfile[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<SubcontractorProfile | null>(null);
  const [profileFormName, setProfileFormName] = useState('');
  const [profileFormContactName, setProfileFormContactName] = useState('');
  const [imagePreviewSrc, setImagePreviewSrc] = useState<string | null>(null);
  const [profileFormPhoto, setProfileFormPhoto] = useState('');
  const [profileFormCinRecto, setProfileFormCinRecto] = useState('');
  const [profileFormCinVerso, setProfileFormCinVerso] = useState('');
  const [profileFormPhone, setProfileFormPhone] = useState('');
  const [profileFormCin, setProfileFormCin] = useState('');
  const [profileFormAddress, setProfileFormAddress] = useState('');
  const [profileFormIce, setProfileFormIce] = useState('');
  const [profileFormRc, setProfileFormRc] = useState('');
  const [profileFormRating, setProfileFormRating] = useState(5);
  const [profileFormNotes, setProfileFormNotes] = useState('');
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

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isSubPickerOpen, setIsSubPickerOpen] = useState(false);
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
  
  const [batches, setBatches] = useState<BatchInput[]>([{ quantity: 0, deliveryDate: '', notes: '', grid: {} }]);
  const [newColorInput, setNewColorInput] = useState('');
  const [modelMaxGrid, setModelMaxGrid] = useState<Record<string, Record<string, number>>>({});
  /** Vrai quand la grille affichée a été déduite de totaux marginaux (commande
   *  antérieure à `grid_json`) : la répartition par couleur n'est pas fiable. */
  const [gridEstimated, setGridEstimated] = useState(false);

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
      if (!resProfiles.ok) throw new Error(tx(lang,{fr:'Echec du chargement des profils sous-traitants',ar:'فشل تحميل ملفات المقاولين من الباطن',en:'Failed to load subcontractor profiles',es:'Error al cargar perfiles de subcontratistas',pt:'Falha ao carregar perfis de subcontratados',tr:'Taşeron profilleri yüklenemedi'}));
      const profilesData = await resProfiles.json();
      setSubcontractorProfiles(profilesData);

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

  // Subcontractor profile handlers
  const openNewProfileModal = () => {
    setEditingProfile(null);
    setProfileFormName('');
    setProfileFormContactName('');
    setProfileFormPhoto('');
    setProfileFormCinRecto('');
    setProfileFormCinVerso('');
    setProfileFormPhone('');
    setProfileFormCin('');
    setProfileFormAddress('');
    setProfileFormIce('');
    setProfileFormRc('');
    setProfileFormRating(5);
    setProfileFormNotes('');
    setIsProfileModalOpen(true);
  };

  const openEditProfileModal = (profile: SubcontractorProfile) => {
    setEditingProfile(profile);
    setProfileFormName(profile.name);
    setProfileFormContactName(profile.contactName || '');
    setProfileFormPhoto(profile.photo || '');
    setProfileFormCinRecto(profile.cinRectoPhoto || '');
    setProfileFormCinVerso(profile.cinVersoPhoto || '');
    setProfileFormPhone(profile.phone || '');
    setProfileFormCin(profile.cin || '');
    setProfileFormAddress(profile.address || '');
    setProfileFormIce(profile.ice || '');
    setProfileFormRc(profile.rc || '');
    setProfileFormRating(profile.rating || 5);
    setProfileFormNotes(profile.notes || '');
    setIsProfileModalOpen(true);
  };

  const handleProfileFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (!ev.target?.result) return;
      // Garder le nom d'origine dans la data: URL (data:<mime>;name=<nom>;base64,...)
      // pour que le téléchargement restitue le fichier tel qu'il a été déposé.
      const raw = ev.target.result as string;
      const sep = raw.indexOf(',');
      const meta = raw.slice(0, sep);
      const withName = meta.includes(';name=')
        ? raw
        : `${meta.replace(';base64', `;name=${encodeURIComponent(file.name)};base64`)}${raw.slice(sep)}`;
      setter(withName);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Nom d'origine encodé dans la data: URL, s'il est présent.
  const originalFileName = (dataUrl: string): string | null => {
    const meta = dataUrl.slice(0, dataUrl.indexOf(','));
    const match = meta.match(/;name=([^;]*)/);
    if (!match) return null;
    try { return decodeURIComponent(match[1]) || null; } catch { return match[1] || null; }
  };

  // Browsers block window.open() on data: URLs — convert to a blob URL first.
  const dataUrlToBlobUrl = (dataUrl: string) => {
    const [meta, base64] = dataUrl.split(',');
    const mime = meta.match(/:(.*?);/)?.[1] || 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  };

  const openDocument = (dataUrl: string) => {
    if (dataUrl.startsWith('data:image')) {
      setImagePreviewSrc(dataUrl);
      return;
    }
    const url = dataUrlToBlobUrl(dataUrl);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const downloadDocument = (dataUrl: string, filename: string) => {
    const url = dataUrlToBlobUrl(dataUrl);
    const a = document.createElement('a');
    a.href = url;
    // Restituer le fichier exactement tel qu'il a été déposé (nom + extension).
    // `filename` ne sert que de repli pour les anciens enregistrements sans nom.
    a.download = originalFileName(dataUrl) || filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileFormName.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/subcontract/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingProfile?.id,
          name: profileFormName.trim(),
          contactName: profileFormContactName,
          photo: profileFormPhoto,
          cinRectoPhoto: profileFormCinRecto,
          cinVersoPhoto: profileFormCinVerso,
          phone: profileFormPhone,
          cin: profileFormCin,
          address: profileFormAddress,
          ice: profileFormIce,
          rc: profileFormRc,
          rating: profileFormRating,
          notes: profileFormNotes
        })
      });
      if (!res.ok) throw new Error(tx(lang,{fr:'Echec de la sauvegarde du profil',ar:'فشل حفظ الملف',en:'Failed to save profile',es:'Error al guardar el perfil',pt:'Falha ao guardar o perfil',tr:'Profil kaydedilemedi'}));
      // Créé depuis le formulaire de commande : le sélectionner directement.
      if (isAddModalOpen && !editingProfile) {
        setFormSubcontractorName(profileFormName.trim());
        setFormSubcontractorPhone(profileFormPhone);
        setFormSubcontractorRating(profileFormRating);
      }
      setIsProfileModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!window.confirm(tx(lang,{fr:'Voulez-vous supprimer ce sous-traitant ?',ar:'هل تريد حذف هذا المقاول من الباطن؟',en:'Do you want to delete this subcontractor?',es:'¿Quiere eliminar este subcontratista?',pt:'Deseja eliminar este subcontratado?',tr:'Bu taşeronu silmek istiyor musunuz?'}))) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/subcontract/profiles/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(tx(lang,{fr:'Echec de la suppression',ar:'فشل الحذف',en:'Deletion failed',es:'Error al eliminar',pt:'Falha ao eliminar',tr:'Silme başarısız'}));
      if (selectedSubcontractorName) setSelectedSubcontractorName(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Helper to parse JSON safely
  const parseJsonSafe = (str: any, fallback = {}) => {
    if (!str) return fallback;
    try {
      return typeof str === 'string' ? JSON.parse(str) : str;
    } catch (e) {
      return fallback;
    }
  };

  /** Sérialise la grille couleur × taille pour l'API.
   *  `grid_json` porte la matrice 2D complète (source de vérité) ; `sizes_json` et
   *  `colors_json` restent les totaux marginaux, conservés pour les écrans qui les
   *  lisent encore. Les cellules à 0 sont omises des marges, pas de la grille. */
  const serializeGrid = (grid: Record<string, Record<string, number>>) => {
    const sizesSum: Record<string, number> = {};
    const colorsSum: Record<string, number> = {};

    Object.entries(grid).forEach(([color, sizesObj]) => {
      const colorTotal = Object.values(sizesObj).reduce((a, b) => a + b, 0);
      if (colorTotal > 0) colorsSum[color] = colorTotal;
      Object.entries(sizesObj).forEach(([sz, qty]) => {
        if (qty > 0) sizesSum[sz] = (sizesSum[sz] || 0) + qty;
      });
    });

    return {
      sizes_json: Object.keys(sizesSum).length > 0 ? JSON.stringify(sizesSum) : null,
      colors_json: Object.keys(colorsSum).length > 0 ? JSON.stringify(colorsSum) : null,
      grid_json: Object.keys(grid).length > 0 ? JSON.stringify(grid) : null,
    };
  };

  /** Reconstruit la grille d'une commande.
   *  `grid_json` est exact. Sans lui (commandes antérieures), on ne peut PAS
   *  reconstituer la matrice : `sizes_json` est un total toutes couleurs confondues.
   *  On répartit alors la quantité sur une seule ligne et on signale l'estimation
   *  via `estimated`, plutôt que de recopier le total dans chaque couleur — ce que
   *  faisait l'ancien code, et qui multipliait les quantités à chaque ré-enregistrement. */
  const restoreGrid = (
    order: SubcontractOrder,
    modelSizes: string[]
  ): { grid: Record<string, Record<string, number>>; estimated: boolean } => {
    const parsedGrid = parseJsonSafe(order.grid_json, null as any);
    if (parsedGrid && typeof parsedGrid === 'object' && Object.keys(parsedGrid).length > 0) {
      return { grid: parsedGrid, estimated: false };
    }

    const parsedSizes: Record<string, number> = parseJsonSafe(order.sizes_json);
    const parsedColors: Record<string, number> = parseJsonSafe(order.colors_json);
    const sizes = modelSizes.length > 0
      ? modelSizes
      : (Object.keys(parsedSizes).length > 0 ? Object.keys(parsedSizes) : COMMON_SIZES);
    const colors = Object.keys(parsedColors);
    const grid: Record<string, Record<string, number>> = {};

    if (colors.length === 0) {
      grid['Standard'] = {};
      sizes.forEach(sz => { grid['Standard'][sz] = parsedSizes[sz] || 0; });
      return { grid, estimated: Object.keys(parsedSizes).length > 0 };
    }

    // Les totaux par taille ne concernent qu'une seule ligne : les affecter à la
    // première couleur et laisser les autres à 0 garde le total global exact.
    colors.forEach((color, idx) => {
      grid[color] = {};
      sizes.forEach(sz => {
        grid[color][sz] = idx === 0 ? (parsedSizes[sz] || 0) : 0;
      });
    });
    return { grid, estimated: colors.length > 1 };
  };

  /** Colonnes de la grille en édition : les tailles réellement présentes dans la
   *  commande, pas une liste figée — sinon toute taille hors standard disparaît
   *  de l'écran tout en restant enregistrée. */
  const editGridSizes = useMemo(() => {
    const seen: string[] = [];
    Object.values(batches[0]?.grid || {}).forEach(sizesObj => {
      Object.keys(sizesObj).forEach(sz => { if (!seen.includes(sz)) seen.push(sz); });
    });
    return seen.length > 0 ? seen : COMMON_SIZES;
  }, [batches]);

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

      const remainingQty = Math.max(0, totalQty - totalDelivered);
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

  // Tab 2: Group orders by subcontractor (list + per-model breakdown)
  const subcontractorGroups = useMemo(() => {
    const map: Record<string, { name: string; phone: string; orders: SubcontractOrder[]; totalQty: number; totalAmount: number; profile: SubcontractorProfile | null }> = {};
    orders.forEach(o => {
      const key = o.subcontractorName || tx(lang,{fr:'Non spécifié',ar:'غير محدد',en:'Not specified',es:'No especificado',pt:'Não especificado',tr:'Belirtilmemiş'});
      if (!map[key]) {
        map[key] = { name: key, phone: o.subcontractorPhone || '', orders: [], totalQty: 0, totalAmount: 0, profile: null };
      }
      map[key].orders.push(o);
      map[key].totalQty += o.totalQuantity || 0;
      map[key].totalAmount += (o.totalQuantity || 0) * (o.pricePerPiece || 0);
      if (!map[key].phone && o.subcontractorPhone) map[key].phone = o.subcontractorPhone;
    });
    subcontractorProfiles.forEach(p => {
      if (!map[p.name]) {
        map[p.name] = { name: p.name, phone: p.phone || '', orders: [], totalQty: 0, totalAmount: 0, profile: p };
      } else {
        map[p.name].profile = p;
        if (!map[p.name].phone) map[p.name].phone = p.phone || '';
      }
    });
    return Object.values(map).sort((a, b) => b.totalQty - a.totalQty);
  }, [orders, subcontractorProfiles, lang]);

  const selectedSubcontractor = useMemo(() => {
    return subcontractorGroups.find(g => g.name === selectedSubcontractorName) || null;
  }, [subcontractorGroups, selectedSubcontractorName]);

  const filteredSubcontractorGroups = useMemo(() => {
    const q = subSearchQuery.trim().toLowerCase();
    if (!q) return subcontractorGroups;
    return subcontractorGroups.filter(g =>
      g.name.toLowerCase().includes(q) ||
      (g.profile?.contactName || '').toLowerCase().includes(q) ||
      (g.phone || '').includes(q)
    );
  }, [subcontractorGroups, subSearchQuery]);

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
        startDate: oldestDate ? new Date(oldestDate).toLocaleDateString('fr-FR') : tx(lang,{fr:'Non commencée',ar:'لم تبدأ',en:'Not started',es:'No iniciado',pt:'Não iniciado',tr:'Başlamadı'}),
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

    setBatches([{
      quantity: firstModel?.meta_data.quantity || 0,
      deliveryDate: '',
      notes: '',
      grid: {}
    }]);
    setModelMaxGrid({});
    setGridEstimated(false);
    setNewColorInput('');
    setError(null);
    setIsAddModalOpen(true);
    if (firstModel) {
      handleModelChange(firstModel.id);
    }
  };

  // Sync client name when model changes in order form
  const handleModelChange = (modelId: string) => {
    setFormModelId(modelId);
    if (modelId === 'MANUAL') {
      setFormClientName('');
      setModelMaxGrid({});
      setBatches(prev => {
        const updated = [...prev];
        if (updated[0]) updated[0].grid = {};
        return updated;
      });
      return;
    }
    const selected = models.find(m => m.id === modelId);
    if (selected) {
      setFormClientName(selected.ficheData?.client || '');

      const colors = selected.ficheData?.colors || [];
      const sizes = selected.ficheData?.sizes || [];
      const gridQuantities = selected.ficheData?.gridQuantities || {};

      if (colors.length > 0 && sizes.length > 0) {
        const newGrid: Record<string, Record<string, number>> = {};
        const newMax: Record<string, Record<string, number>> = {};
        colors.forEach(c => {
          newGrid[c.name] = {};
          newMax[c.name] = {};
          sizes.forEach((sz, sIdx) => {
            const key = `${c.id}_${sIdx}`;
            newGrid[c.name][sz] = 0;
            newMax[c.name][sz] = gridQuantities[key] || 0;
          });
        });
        setModelMaxGrid(newMax);
        setFormTotalQuantity(0);
        setBatches(prev => {
          const updated = [...prev];
          if (updated[0]) {
            updated[0].grid = newGrid;
            updated[0].quantity = 0;
          }
          return updated;
        });
      } else {
        setModelMaxGrid({});
        const qty = selected.meta_data.quantity || 0;
        setFormTotalQuantity(qty);
        setBatches(prev => {
          const updated = [...prev];
          if (updated[0]) {
            updated[0].grid = {};
            updated[0].quantity = qty;
          }
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

  const handleFillFullQuantity = () => {
    setBatches(prev => {
      const updated = [...prev];
      const batch = updated[0];
      let total = 0;
      Object.keys(batch.grid).forEach(color => {
        Object.keys(batch.grid[color]).forEach(sz => {
          const max = modelMaxGrid[color]?.[sz] || 0;
          batch.grid[color][sz] = max;
          total += max;
        });
      });
      setFormTotalQuantity(total);
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
      setError(tx(lang,{fr:'Veuillez specifier le nom du sous-traitant.',ar:'يرجى تحديد اسم المقاول من الباطن.',en:'Please specify the subcontractor name.',es:'Por favor, especifique el nombre del subcontratista.',pt:'Por favor, especifique o nome do subcontratado.',tr:'Lütfen taşeron adını belirtin.'}));
      setActionLoading(false);
      return;
    }

    const selectedModel = models.find(m => m.id === formModelId);
    const modelName = formModelId === 'MANUAL' ? 'Commande Directe' : (selectedModel?.meta_data?.nom_modele || 'Inconnu');

    const gridJson = serializeGrid(batches[0].grid);

    const body = {
      modelId: formModelId,
      modelName,
      clientName: formClientName,
      totalQuantity: formTotalQuantity,
      subcontractorName: formSubcontractorName,
      pricePerPiece: formPricePerPiece,
      deliveryDate: batches[0].deliveryDate || new Date().toISOString().split('T')[0],
      status: 'PENDING',
      ...gridJson,
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
      await applySubcontractPriceToModel();
      fetchData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || tx(lang,{fr:'Une erreur est survenue.',ar:'حدث خطأ.',en:'An error occurred.',es:'Ocurrió un error.',pt:'Ocorreu um erro.',tr:'Bir hata oluştu.'}));
    } finally {
      setActionLoading(false);
    }
  };

  // Après création d'une commande : proposer de répercuter le prix du sous-traitant
  // sur le calcul de coût du modèle (Façon = matières + prix ; Tout compris = prix seul).
  const applySubcontractPriceToModel = async () => {
    if (formModelId === 'MANUAL' || formPricePerPiece <= 0) return;
    const model = models.find(m => m.id === formModelId);
    if (!model) return;

    const mode: 'facon' | 'complet' = formTissuFournisseur === 'SUBCONTRACTOR' ? 'complet' : 'facon';
    const modeLabel = mode === 'complet'
      ? tx(lang,{fr:'Tout compris (prix seul)',ar:'كلشي عليه (الثمن فقط)',en:'All-inclusive (price only)',es:'Todo incluido (solo precio)',pt:'Tudo incluído (apenas preço)',tr:'Her şey dahil (sadece fiyat)'})
      : tx(lang,{fr:'Façon (matières + prix)',ar:'خياطة فقط (المواد + الثمن)',en:'Cut-Make (materials + price)',es:'Confección (materiales + precio)',pt:'Confeção (materiais + preço)',tr:'Fason (malzeme + fiyat)'});

    const question = tx(lang,{
      fr:`Appliquer ${formPricePerPiece} MAD/pièce au calcul de coût de « ${model.meta_data.nom_modele} » ?\n\nMode : ${modeLabel}\n\nCela remplacera le coût de main d'œuvre calculé depuis la gamme.`,
      ar:`واش نطبّقو ${formPricePerPiece} MAD/قطعة فحساب تكلفة «${model.meta_data.nom_modele}»؟\n\nالنوع: ${modeLabel}\n\nهادشي غادي يعوّض تكلفة اليد العاملة المحسوبة من الـ gamme.`,
      en:`Apply ${formPricePerPiece} MAD/piece to the cost calculation of "${model.meta_data.nom_modele}"?\n\nMode: ${modeLabel}\n\nThis will replace the labour cost computed from the gamme.`,
      es:`¿Aplicar ${formPricePerPiece} MAD/pieza al cálculo de coste de «${model.meta_data.nom_modele}»?\n\nModo: ${modeLabel}\n\nEsto reemplazará el coste de mano de obra calculado desde la gama.`,
      pt:`Aplicar ${formPricePerPiece} MAD/peça ao cálculo de custo de "${model.meta_data.nom_modele}"?\n\nModo: ${modeLabel}\n\nIsto substituirá o custo de mão de obra calculado a partir da gama.`,
      tr:`"${model.meta_data.nom_modele}" maliyet hesabına ${formPricePerPiece} MAD/adet uygulansın mı?\n\nMod: ${modeLabel}\n\nBu, gamme'den hesaplanan işçilik maliyetinin yerine geçecek.`,
    });

    if (!window.confirm(question)) return;

    const updated: ModelData = {
      ...model,
      ficheData: {
        ...(model.ficheData as any),
        soustraitance: { active: true, mode, prix: formPricePerPiece },
      },
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error(tx(lang,{fr:'Echec de la mise à jour du modèle',ar:'فشل تحديث الموديل',en:'Failed to update the model',es:'Error al actualizar el modelo',pt:'Falha ao atualizar o modelo',tr:'Model güncellenemedi'}));
      setModels?.(prev => prev.map(m => (m.id === updated.id ? updated : m)));
    } catch (err: any) {
      setError(err.message);
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

    // Restore matrix : grid_json fait foi, sinon reconstruction estimée signalée.
    const editedModel = models.find(m => m.id === order.modelId);
    const modelSizes = editedModel?.ficheData?.sizes || editedModel?.meta_data?.sizes || [];
    const { grid, estimated } = restoreGrid(order, modelSizes);
    setGridEstimated(estimated);

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

    const gridJson = serializeGrid(batches[0].grid);

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
      ...gridJson,
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

  /** Bascule un des quatre jalons logistiques directement depuis la pastille.
   *  Ces champs n'ont plus d'onglet dédié dans le formulaire : la pastille EST
   *  le contrôle. Mise à jour optimiste pour que le clic réponde tout de suite,
   *  avec retour à l'état précédent si le serveur refuse. */
  const handleToggleMilestone = async (
    order: SubcontractOrder,
    field: 'tissuStatus' | 'fournituresStatus' | 'ficheTechniqueSent' | 'protoStatus'
  ) => {
    let patch: Partial<SubcontractOrder>;
    switch (field) {
      case 'tissuStatus':
        patch = { tissuStatus: order.tissuStatus === 'SENT' ? 'PENDING' : 'SENT' };
        break;
      case 'fournituresStatus':
        patch = { fournituresStatus: order.fournituresStatus === 'DELIVERED' ? 'PENDING' : 'DELIVERED' };
        break;
      case 'ficheTechniqueSent':
        patch = { ficheTechniqueSent: order.ficheTechniqueSent === 1 ? 0 : 1 };
        break;
      case 'protoStatus':
        patch = { protoStatus: order.protoStatus === 'APPROVED' ? 'PENDING' : 'APPROVED' };
        break;
    }

    setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, ...patch } : o)));
    setDetailOrder(prev => (prev && prev.id === order.id ? { ...prev, ...patch } : prev));

    try {
      const res = await fetch(`/api/subcontract/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch)
      });
      if (!res.ok) throw new Error(tx(lang,{fr:'Echec de la mise à jour',ar:'فشل التحديث',en:'Update failed',es:'Error al actualizar',pt:'Falha na atualização',tr:'Güncelleme başarısız'}));
    } catch (err: any) {
      // Le serveur n'a pas pris la modification : ne pas laisser l'écran mentir.
      setOrders(prev => prev.map(o => (o.id === order.id ? order : o)));
      setDetailOrder(prev => (prev && prev.id === order.id ? order : prev));
      alert(err.message || tx(lang,{fr:'Erreur de communication',ar:'خطأ في الاتصال',en:'Communication error',es:'Error de comunicación',pt:'Erro de comunicação',tr:'İletişim hatası'}));
    }
  };

  /** Décrit les quatre pastilles d'une commande — même définition sur la carte
   *  et dans la fiche, pour qu'elles ne puissent pas diverger. */
  const milestoneChips = (order: SubcontractOrder, size: 'sm' | 'md' = 'sm') => ([
    {
      field: 'tissuStatus' as const,
      on: order.tissuStatus === 'SENT',
      tone: 'emerald' as const,
      icon: <Layers className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />,
      label: tx(lang,{fr:'Tissu',ar:'قماش',en:'Fabric',es:'Tejido',pt:'Tecido',tr:'Kumaş'}),
      title: order.tissuStatus === 'SENT'
        ? tx(lang,{fr:'Tissu expédié — cliquer pour repasser en attente',ar:'القماش مُرسَل — انقر للإرجاع إلى الانتظار',en:'Fabric shipped — click to set back to pending',es:'Tejido enviado — clic para volver a pendiente',pt:'Tecido expedido — clique para voltar a pendente',tr:'Kumaş sevk edildi — beklemeye almak için tıklayın'})
        : tx(lang,{fr:'Tissu en attente — cliquer pour marquer expédié',ar:'القماش في الانتظار — انقر لتسجيله مُرسَلاً',en:'Fabric pending — click to mark shipped',es:'Tejido pendiente — clic para marcar enviado',pt:'Tecido pendente — clique para marcar expedido',tr:'Kumaş beklemede — sevk edildi olarak işaretlemek için tıklayın'}),
      size,
    },
    {
      field: 'fournituresStatus' as const,
      on: order.fournituresStatus === 'DELIVERED',
      tone: 'emerald' as const,
      icon: <Settings className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />,
      label: tx(lang,{fr:'Fournitures',ar:'لوازم',en:'Supplies',es:'Fornituras',pt:'Acessórios',tr:'Malzemeler'}),
      title: order.fournituresStatus === 'DELIVERED'
        ? tx(lang,{fr:'Fournitures livrées — cliquer pour repasser en attente',ar:'اللوازم مُسلَّمة — انقر للإرجاع إلى الانتظار',en:'Supplies delivered — click to set back to pending',es:'Fornituras entregadas — clic para volver a pendiente',pt:'Acessórios entregues — clique para voltar a pendente',tr:'Malzemeler teslim edildi — beklemeye almak için tıklayın'})
        : tx(lang,{fr:'Fournitures en attente — cliquer pour marquer livrées',ar:'اللوازم في الانتظار — انقر لتسجيلها مُسلَّمة',en:'Supplies pending — click to mark delivered',es:'Fornituras pendientes — clic para marcar entregadas',pt:'Acessórios pendentes — clique para marcar entregues',tr:'Malzemeler beklemede — teslim edildi olarak işaretlemek için tıklayın'}),
      size,
    },
    {
      field: 'ficheTechniqueSent' as const,
      on: order.ficheTechniqueSent === 1,
      tone: 'blue' as const,
      icon: <FileText className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />,
      label: tx(lang,{fr:'FT',ar:'بطاقة فنية',en:'TS',es:'FT',pt:'FT',tr:'FT'}),
      title: order.ficheTechniqueSent === 1
        ? tx(lang,{fr:'Fiche technique envoyée — cliquer pour annuler',ar:'البطاقة الفنية مُرسَلة — انقر للإلغاء',en:'Tech sheet sent — click to undo',es:'Ficha técnica enviada — clic para anular',pt:'Ficha técnica enviada — clique para anular',tr:'Teknik föy gönderildi — geri almak için tıklayın'})
        : tx(lang,{fr:'Fiche technique non envoyée — cliquer pour marquer envoyée',ar:'البطاقة الفنية غير مُرسَلة — انقر لتسجيلها مُرسَلة',en:'Tech sheet not sent — click to mark sent',es:'Ficha técnica no enviada — clic para marcar enviada',pt:'Ficha técnica não enviada — clique para marcar enviada',tr:'Teknik föy gönderilmedi — gönderildi olarak işaretlemek için tıklayın'}),
      size,
    },
    {
      field: 'protoStatus' as const,
      on: order.protoStatus === 'APPROVED',
      tone: 'purple' as const,
      icon: <ShieldCheck className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />,
      label: tx(lang,{fr:'Proto',ar:'عينة',en:'Proto',es:'Proto',pt:'Proto',tr:'Proto'}),
      title: order.protoStatus === 'APPROVED'
        ? tx(lang,{fr:'Prototype validé — cliquer pour repasser en attente',ar:'النموذج الأولي معتمد — انقر للإرجاع إلى الانتظار',en:'Prototype approved — click to set back to pending',es:'Prototipo validado — clic para volver a pendiente',pt:'Protótipo validado — clique para voltar a pendente',tr:'Prototip onaylandı — beklemeye almak için tıklayın'})
        : tx(lang,{fr:'Prototype en attente — cliquer pour valider',ar:'النموذج الأولي في الانتظار — انقر للاعتماد',en:'Prototype pending — click to approve',es:'Prototipo pendiente — clic para validar',pt:'Protótipo pendente — clique para validar',tr:'Prototip beklemede — onaylamak için tıklayın'}),
      size,
    },
  ]);

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
                  <td style="font-weight: 800; color: #1e1b4b;">{tx(lang, {fr: 'Standard', ar: 'قياسي', en: 'Standard', es: 'Estándar', pt: 'Padrão', tr: 'Standart'})}</td>
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
              {tx(lang,{fr:'Sous-traitance & Monawla',ar:'المقاولة من الباطن ومناولة',en:'Subcontracting & Monawla',es:'Subcontratación & Monawla',pt:'Subcontratação & Monawla',tr:'Taşeronluk & Monawla'})}
            </h1>
          </div>
          {activeTab === 'orders' && (
            <button
              onClick={() => setIsChoiceModalOpen(true)}
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
          onClick={() => setActiveTab('subcontractors')}
          className={`px-2.5 lg:px-3 py-1.5 rounded-lg font-bold text-[10px] lg:text-xs transition-all flex items-center gap-1 lg:gap-1.5 whitespace-nowrap ${activeTab === 'subcontractors' ? 'bg-indigo-600 dark:bg-dk-accent text-white shadow-sm dark:shadow-dk-sm dark:shadow-none' : 'text-slate-500 dark:text-dk-muted hover:text-slate-800 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 dark:hover:bg-dk-elevated'}`}
        >
          <Users className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
          <span>{tx(lang,{fr:'Sous-traitants',ar:'المقاولون من الباطن',en:'Subcontractors',es:'Subcontratistas',pt:'Subcontratados',tr:'Taşeronlar'})}</span>
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
                              <p className="font-bold text-slate-800 dark:text-dk-text leading-none">{tx(lang,{fr:'Atelier:',ar:'الورشة:',en:'Workshop:',es:'Taller:',pt:'Oficina:',tr:'Atölye:'})} {order.subcontractorName}</p>
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

                          {/* Jalons logistiques — cliquables, ils remplacent l'ancien onglet « Logistique » */}
                          <div className="flex flex-wrap gap-1 pt-1.5 border-t border-slate-100 dark:border-dk-border">
                            {milestoneChips(order).map(chip => (
                              <MilestoneChip key={chip.field} {...chip} onToggle={() => handleToggleMilestone(order, chip.field)} />
                            ))}
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
                              onClick={() => setIsChoiceModalOpen(true)}
                              className="lg:hidden fixed bottom-6 right-6 w-12 h-12 bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover dark:hover:bg-dk-accent/90 active:scale-95 text-white rounded-full shadow-lg dark:shadow-dk-lg flex items-center justify-center transition-all z-50 hover:shadow-xl border border-indigo-500 dark:border-dk-accent"
                              title={tx(lang,{fr:'Nouvelle Commande',ar:'أمر شراء جديد'})}
                            >
                              <Plus className="w-6 h-6 text-white" />
                            </button>
                          </div>
                        )}

          {/* ======================================= */}
          {/* TAB 2: SOUS-TRAITANTS (SUBCONTRACTORS) */}
          {/* ======================================= */}
          {activeTab === 'subcontractors' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
              <div className={`lg:col-span-1 space-y-2 ${selectedSubcontractor ? 'hidden lg:block' : ''}`}>
                <button
                  onClick={openNewProfileModal}
                  className="w-full flex items-center justify-center gap-2 p-2.5 rounded-2xl border border-dashed border-indigo-300 dark:border-dk-accent/50 text-indigo-600 dark:text-dk-accent-text font-bold text-xs hover:bg-indigo-50 dark:hover:bg-dk-accent/10 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tx(lang,{fr:'Nouveau Sous-traitant',ar:'مقاول من الباطن جديد',en:'New Subcontractor',es:'Nuevo Subcontratista',pt:'Novo Subcontratado',tr:'Yeni Taşeron'})}</span>
                </button>

                {subcontractorGroups.length > 0 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={subSearchQuery}
                      onChange={(e) => setSubSearchQuery(e.target.value)}
                      placeholder={tx(lang,{fr:'Rechercher un sous-traitant...',ar:'ابحث عن مقاول من الباطن...',en:'Search a subcontractor...',es:'Buscar un subcontratista...',pt:'Procurar um subcontratado...',tr:'Taşeron ara...'})}
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl pl-8 pr-3 py-2 text-xs outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                    />
                  </div>
                )}

                <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-0.5">
                  {subcontractorGroups.length === 0 ? (
                    <div className="bg-white dark:bg-dk-surface rounded-3xl border border-slate-200 dark:border-dk-border/60 p-10 text-center text-slate-400 dark:text-dk-muted shadow-sm dark:shadow-dk-sm dark:shadow-none">
                      <Users className="w-10 h-10 mx-auto mb-2 opacity-25" />
                      <p className="text-xs font-semibold">{tx(lang,{fr:'Aucun sous-traitant',ar:'لا يوجد مقاول من الباطن',en:'No subcontractor',es:'Ningún subcontratista',pt:'Nenhum subcontratado',tr:'Taşeron yok'})}</p>
                    </div>
                  ) : filteredSubcontractorGroups.length === 0 ? (
                    <div className="text-center text-slate-400 dark:text-dk-muted text-xs py-6">
                      {tx(lang,{fr:'Aucun résultat',ar:'لا توجد نتائج',en:'No results',es:'Sin resultados',pt:'Sem resultados',tr:'Sonuç yok'})}
                    </div>
                  ) : filteredSubcontractorGroups.map(g => (
                    <button
                      key={g.name}
                      onClick={() => setSelectedSubcontractorName(g.name)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${selectedSubcontractorName === g.name ? 'border-indigo-500 dark:border-dk-accent bg-indigo-50 dark:bg-dk-accent/20' : 'border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface hover:border-slate-300 dark:hover:border-dk-border'}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {g.profile?.photo ? (
                          <img src={g.profile.photo} alt={g.name} className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-dk-border" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                            <Users className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 dark:text-dk-text truncate">{g.name}</p>
                          <p className="text-[11px] text-slate-400 dark:text-dk-muted mt-0.5">{g.orders.length} {tx(lang,{fr:'commande(s)',ar:'طلبية(ات)',en:'order(s)',es:'pedido(s)',pt:'encomenda(s)',tr:'sipariş'})} · {g.totalQty.toLocaleString()} pcs</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              <div className={`lg:col-span-2 ${selectedSubcontractor ? '' : 'hidden lg:block'}`}>
                {!selectedSubcontractor ? (
                  <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/60 rounded-3xl p-16 text-center text-slate-400 dark:text-dk-muted h-full flex flex-col justify-center items-center shadow-sm dark:shadow-dk-sm dark:shadow-none">
                    <Users className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-xs font-semibold">{tx(lang,{fr:'Sélectionnez un sous-traitant pour voir ses modèles.',ar:'اختر مقاولاً من الباطن لعرض موديلاته.',en:'Select a subcontractor to see their models.',es:'Seleccione un subcontratista para ver sus modelos.',pt:'Selecione um subcontratado para ver os seus modelos.',tr:'Modellerini görmek için bir taşeron seçin.'})}</p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/60 rounded-3xl overflow-hidden shadow-sm dark:shadow-dk-sm dark:shadow-none">
                    <button
                      type="button"
                      onClick={() => setSelectedSubcontractorName(null)}
                      className="lg:hidden w-full flex items-center gap-1.5 px-4 pt-3 text-[11px] font-bold text-slate-500 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent-text transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                      <span>{tx(lang,{fr:'Retour',ar:'رجوع',en:'Back',es:'Volver',pt:'Voltar',tr:'Geri'})}</span>
                    </button>
                    <div className="p-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {selectedSubcontractor.profile?.photo ? (
                          <button type="button" onClick={() => setImagePreviewSrc(selectedSubcontractor.profile!.photo!)} className="shrink-0">
                            <img src={selectedSubcontractor.profile.photo} alt={selectedSubcontractor.name} className="w-11 h-11 rounded-full object-cover border border-slate-200 dark:border-dk-border" />
                          </button>
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                            <Users className="w-5 h-5 text-slate-400 dark:text-dk-muted" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-800 dark:text-dk-text truncate">{selectedSubcontractor.name}</h3>
                          {selectedSubcontractor.profile?.contactName && <p className="text-[11px] text-slate-500 dark:text-dk-text-soft truncate">{selectedSubcontractor.profile.contactName}</p>}
                          {selectedSubcontractor.phone && <p className="text-[11px] text-slate-400 dark:text-dk-muted">{selectedSubcontractor.phone}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 dark:text-dk-muted uppercase font-bold">{tx(lang,{fr:'Total',ar:'المجموع',en:'Total',es:'Total',pt:'Total',tr:'Toplam'})}</p>
                          <p className="font-bold text-slate-800 dark:text-dk-text">{selectedSubcontractor.totalAmount.toLocaleString()} MAD</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => selectedSubcontractor.profile
                            ? openEditProfileModal(selectedSubcontractor.profile)
                            : openNewProfileModal()}
                          className="p-2 rounded-lg text-slate-400 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-slate-600 dark:hover:text-dk-text-soft transition-colors"
                          title={tx(lang,{fr:'Modifier le profil',ar:'تعديل الملف',en:'Edit profile',es:'Editar perfil',pt:'Editar perfil',tr:'Profili düzenle'})}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {selectedSubcontractor.profile && (
                          <button
                            type="button"
                            onClick={() => handleDeleteProfile(selectedSubcontractor.profile!.id)}
                            className="p-2 rounded-lg text-rose-400 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                            title={tx(lang,{fr:'Supprimer le profil',ar:'حذف الملف',en:'Delete profile',es:'Eliminar perfil',pt:'Eliminar perfil',tr:'Profili sil'})}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedSubcontractor.profile ? (
                      <div className="p-4 border-b border-slate-100 dark:border-dk-border grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/60 dark:bg-dk-bg/40">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'CIN',ar:'البطاقة الوطنية',en:'National ID',es:'CIN',pt:'CIN',tr:'Kimlik No'})}</p>
                          <p className="font-semibold text-slate-700 dark:text-dk-text-soft">{selectedSubcontractor.profile.cin || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'ICE',ar:'ICE',en:'ICE',es:'ICE',pt:'ICE',tr:'ICE'})}</p>
                          <p className="font-semibold text-slate-700 dark:text-dk-text-soft">{selectedSubcontractor.profile.ice || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">RC</p>
                          <p className="font-semibold text-slate-700 dark:text-dk-text-soft">{selectedSubcontractor.profile.rc || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'Évaluation',ar:'التقييم',en:'Rating',es:'Evaluación',pt:'Avaliação',tr:'Değerlendirme'})}</p>
                          <p className="font-semibold text-amber-500">{'★'.repeat(Math.round(selectedSubcontractor.profile.rating || 5))}</p>
                        </div>
                        {selectedSubcontractor.profile.address && (
                          <div className="col-span-2 md:col-span-2">
                            <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'Adresse',ar:'العنوان',en:'Address',es:'Dirección',pt:'Morada',tr:'Adres'})}</p>
                            <p className="font-semibold text-slate-700 dark:text-dk-text-soft">{selectedSubcontractor.profile.address}</p>
                          </div>
                        )}
                        {selectedSubcontractor.profile.notes && (
                          <div className="col-span-2 md:col-span-2">
                            <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'Notes',ar:'ملاحظات',en:'Notes',es:'Notas',pt:'Notas',tr:'Notlar'})}</p>
                            <p className="font-semibold text-slate-700 dark:text-dk-text-soft">{selectedSubcontractor.profile.notes}</p>
                          </div>
                        )}
                        {(selectedSubcontractor.profile.cinRectoPhoto || selectedSubcontractor.profile.cinVersoPhoto) && (
                          <div className="col-span-2 md:col-span-4">
                            <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-1.5">{tx(lang,{fr:"Carte d'identité",ar:'البطاقة الوطنية',en:'ID card',es:'DNI',pt:'Cartão de identidade',tr:'Kimlik kartı'})}</p>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { label: tx(lang,{fr:'Recto',ar:'الوجه',en:'Front',es:'Anverso',pt:'Frente',tr:'Ön'}), value: selectedSubcontractor.profile.cinRectoPhoto },
                                { label: tx(lang,{fr:'Verso',ar:'الظهر',en:'Back',es:'Reverso',pt:'Verso',tr:'Arka'}), value: selectedSubcontractor.profile.cinVersoPhoto },
                              ].filter(d => d.value).map((doc, i) => (
                                <div key={i} className="flex items-center gap-1 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg pl-2 pr-1 py-1">
                                  <span className="text-[10px] font-bold text-slate-600 dark:text-dk-text-soft">{doc.label}</span>
                                  <button
                                    type="button"
                                    onClick={() => openDocument(doc.value!)}
                                    className="p-1 rounded text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent-text transition-colors"
                                    title={tx(lang,{fr:'Ouvrir',ar:'فتح',en:'Open',es:'Abrir',pt:'Abrir',tr:'Aç'})}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => downloadDocument(doc.value!, `CIN-${doc.label}-${selectedSubcontractor.name}`)}
                                    className="p-1 rounded text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent-text transition-colors"
                                    title={tx(lang,{fr:'Télécharger',ar:'تنزيل',en:'Download',es:'Descargar',pt:'Descarregar',tr:'İndir'})}
                                  >
                                    <ArrowRight className="w-3.5 h-3.5 rotate-90" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-dk-border bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[11px] font-semibold">
                        {tx(lang,{fr:'Aucun profil enregistré pour ce sous-traitant — cliquez sur modifier pour compléter ses informations.',ar:'لا يوجد ملف مسجل لهذا المقاول من الباطن — انقر على تعديل لإكمال معلوماته.',en:'No profile saved for this subcontractor — click edit to complete their information.',es:'No hay perfil guardado para este subcontratista — haga clic en editar para completar su información.',pt:'Nenhum perfil guardado para este subcontratado — clique em editar para completar as informações.',tr:'Bu taşeron için kayıtlı profil yok — bilgilerini tamamlamak için düzenlemeye tıklayın.'})}
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-dk-bg border-b border-slate-100 dark:border-dk-border text-slate-500 dark:text-dk-muted font-semibold uppercase">
                          <tr>
                            <th className="px-4 py-3">{tx(lang,{fr:'Modèle',ar:'الموديل',en:'Model',es:'Modelo',pt:'Modelo',tr:'Model'})}</th>
                            <th className="px-4 py-3">{tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})}</th>
                            <th className="px-4 py-3">{tx(lang,{fr:'Prix/pièce',ar:'السعر/قطعة',en:'Price/piece',es:'Precio/pieza',pt:'Preço/peça',tr:'Fiyat/adet'})}</th>
                            <th className="px-4 py-3">{tx(lang,{fr:'Total',ar:'المجموع',en:'Total',es:'Total',pt:'Total',tr:'Toplam'})}</th>
                            <th className="px-4 py-3">{tx(lang,{fr:'Livraison',ar:'التسليم',en:'Delivery',es:'Entrega',pt:'Entrega',tr:'Teslimat'})}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                          {selectedSubcontractor.orders.map(o => {
                            const m = models.find(mm => mm.id === o.modelId);
                            const total = (o.totalQuantity || 0) * (o.pricePerPiece || 0);
                            return (
                              <tr
                                key={o.id}
                                onClick={() => m && setModelInfoTarget(m)}
                                className={`${m ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-dk-elevated/60' : ''} transition-colors`}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    {m?.image ? (
                                      <img src={m.image} alt={o.modelName} className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-dk-border" />
                                    ) : (
                                      <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                                        <Package className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted" />
                                      </div>
                                    )}
                                    <span className="font-semibold text-slate-800 dark:text-dk-text">{o.modelName || 'N/A'}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-dk-text-soft">{(o.totalQuantity || 0).toLocaleString()} pcs</td>
                                <td className="px-4 py-3 text-slate-700 dark:text-dk-text-soft">{(o.pricePerPiece || 0).toLocaleString()} MAD</td>
                                <td className="px-4 py-3 font-semibold text-slate-800 dark:text-dk-text">{total.toLocaleString()} MAD</td>
                                <td className="px-4 py-3 text-slate-700 dark:text-dk-text-soft">{o.deliveryDate || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
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
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase whitespace-nowrap inline-block ${
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
      {typeof document !== 'undefined' && isChoiceModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
          <div className="absolute inset-0 bg-slate-900/70 dark:bg-black/70 backdrop-blur-md" onClick={() => setIsChoiceModalOpen(false)} />
          <div className="relative my-auto bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-xl overflow-hidden flex flex-col border border-slate-200 dark:border-dk-border">
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
            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
              <div
                onClick={() => { setIsChoiceModalOpen(false); onNavigate?.('library'); }}
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
              <div
                onClick={() => { setIsChoiceModalOpen(false); openAddModal(); }}
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
          {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] z-[200] flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative my-auto bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50 dark:bg-dk-surface/50">
              <h2 className="font-bold text-slate-800 dark:text-dk-text text-base flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent" />
                <span>{tx(lang,{fr:'Nouvelle Commande de Sous-traitance',ar:'أمر مقاولة من الباطن جديد',en:'New Subcontract Order',es:'Nuevo Pedido de Subcontratación',pt:'Nova Encomenda de Subcontratação',tr:'Yeni Taşeron Siparişi'})}</span>
              </h2>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-650 dark:hover:text-dk-text-soft">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddOrder} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-600 dark:text-dk-text-soft">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 relative">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Modèle *',ar:'الموديل *',en:'Model *',es:'Modelo *',pt:'Modelo *',tr:'Model *'})}</label>
                  <button
                    type="button"
                    onClick={() => setIsModelPickerOpen(v => !v)}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white flex items-center gap-2.5"
                  >
                    {formModelId === 'MANUAL' ? (
                      <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                      </div>
                    ) : (
                      (() => {
                        const m = models.find(mm => mm.id === formModelId);
                        return m?.image ? (
                          <img src={m.image} alt={m.meta_data.nom_modele} className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-dk-border" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                          </div>
                        );
                      })()
                    )}
                    <span className="flex-1 text-left truncate">
                      {formModelId === 'MANUAL'
                        ? tx(lang,{fr:'Saisie Manuelle (Sans modèle existant)',ar:'إدخال يدوي (بدون موديل موجود)',en:'Manual Entry (No existing model)',es:'Entrada Manual (Sin modelo existente)',pt:'Inserção Manual (Sem modelo existente)',tr:'Manuel Giriş (Mevcut model yok)'})
                        : (models.find(mm => mm.id === formModelId)?.meta_data.nom_modele || tx(lang,{fr:'Sélectionner un modèle',ar:'اختر موديل',en:'Select a model',es:'Seleccionar un modelo',pt:'Selecionar um modelo',tr:'Bir model seçin'}))}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0" />
                  </button>

                  {isModelPickerOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl shadow-lg dark:shadow-dk-elevated max-h-64 overflow-y-auto">
                      {models.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => { handleModelChange(m.id); setIsModelPickerOpen(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-left border-b border-slate-100 dark:border-dk-border last:border-b-0"
                        >
                          {m.image ? (
                            <img src={m.image} alt={m.meta_data.nom_modele} className="w-9 h-9 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-dk-border" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 dark:text-dk-text truncate">{m.meta_data.nom_modele}</p>
                            <p className="text-[10px] text-slate-400 dark:text-dk-muted truncate">
                              {m.meta_data.reference || tx(lang,{fr:'Aucune ref',ar:'لا يوجد مرجع',en:'No ref',es:'Sin ref',pt:'Sem ref',tr:'Referans yok'})}
                              {m.meta_data.date_creation ? ` · ${new Date(m.meta_data.date_creation).toLocaleDateString()}` : ''}
                            </p>
                          </div>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => { handleModelChange('MANUAL'); setIsModelPickerOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-left"
                      >
                        <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                        </div>
                        <p className="font-semibold text-slate-800 dark:text-dk-text">{tx(lang,{fr:'Saisie Manuelle (Sans modèle existant)',ar:'إدخال يدوي (بدون موديل موجود)',en:'Manual Entry (No existing model)',es:'Entrada Manual (Sin modelo existente)',pt:'Inserção Manual (Sem modelo existente)',tr:'Manuel Giriş (Mevcut model yok)'})}</p>
                      </button>
                    </div>
                  )}
                </div>

                {Object.keys(batches[0].grid).length === 0 && (
                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Quantité *',ar:'الكمية *',en:'Quantity *',es:'Cantidad *',pt:'Quantidade *',tr:'Miktar *'})}</label>
                    <input
                      type="number"
                      value={formTotalQuantity || ''}
                      onChange={(e) => setFormTotalQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white"
                      required
                    />
                  </div>
                )}
              </div>

              {Object.keys(batches[0].grid).length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Répartition Couleur / Taille *',ar:'التوزيع لون / مقاس *',en:'Color / Size Breakdown *',es:'Reparto Color / Talla *',pt:'Repartição Cor / Tamanho *',tr:'Renk / Beden Dağılımı *'})}</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleFillFullQuantity}
                        className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-dk-accent/20 text-indigo-600 dark:text-dk-accent-text text-[10px] font-bold hover:bg-indigo-100 dark:hover:bg-dk-accent/30 transition-colors"
                      >
                        {tx(lang,{fr:'Quantité complète',ar:'الكمية الكاملة',en:'Full quantity',es:'Cantidad completa',pt:'Quantidade completa',tr:'Tam miktar'})}
                      </button>
                      <span className="font-bold text-indigo-600 dark:text-dk-accent-text">{formTotalQuantity.toLocaleString()} pcs</span>
                    </div>
                  </div>
                  {gridEstimated && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/25 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="text-[10px] font-semibold leading-relaxed">
                        {tx(lang,{
                          fr:"Grille estimée : cette commande a été créée avant l'enregistrement du détail couleur × taille. Le total est exact, mais la répartition par couleur est à vérifier avant d'enregistrer.",
                          ar:'شبكة تقديرية: هذا الأمر أُنشئ قبل تسجيل تفصيل اللون × المقاس. المجموع صحيح، لكن التوزيع حسب اللون يحتاج تحقّقاً قبل الحفظ.',
                          en:'Estimated grid: this order predates color × size detail storage. The total is exact, but the per-color split must be checked before saving.',
                          es:'Cuadrícula estimada: este pedido es anterior al guardado del detalle color × talla. El total es exacto, pero revise el reparto por color antes de guardar.',
                          pt:'Grelha estimada: esta encomenda é anterior ao registo do detalhe cor × tamanho. O total está correto, mas verifique a repartição por cor antes de guardar.',
                          tr:'Tahmini tablo: bu sipariş, renk × beden detayının kaydedilmesinden önce oluşturuldu. Toplam doğru, ancak renk dağılımını kaydetmeden önce kontrol edin.'
                        })}
                      </span>
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-dk-border">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted font-bold border-b border-slate-200 dark:border-dk-border">
                          <th className="py-2 px-3">{tx(lang,{fr:'Couleur',ar:'اللون',en:'Color',es:'Color',pt:'Cor',tr:'Renk'})}</th>
                          {Object.keys(Object.values(batches[0].grid)[0] || {}).map(sz => (
                            <th key={sz} className="py-2 px-2 text-center">{sz}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                        {Object.entries(batches[0].grid).map(([color, sizesObj]) => (
                          <tr key={color}>
                            <td className="py-1.5 px-3 font-semibold text-slate-700 dark:text-dk-text-soft">
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full shrink-0 border border-slate-200 dark:border-dk-border" style={{ backgroundColor: colorNameToHex(color) }}></span>
                                <span>{color}</span>
                              </div>
                            </td>
                            {Object.entries(sizesObj).map(([sz, qty]) => {
                              const max = modelMaxGrid[color]?.[sz] || 0;
                              return (
                                <td key={sz} className="py-1 px-1">
                                  <div className="flex flex-col items-center">
                                    <input
                                      type="number"
                                      min={0}
                                      max={max || undefined}
                                      value={qty || ''}
                                      onChange={(e) => handleUpdateGridQty(color, sz, Math.min(max || Infinity, parseInt(e.target.value) || 0))}
                                      className="w-14 text-center bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border rounded p-1 text-xs focus:border-indigo-500 dark:focus:border-dk-accent outline-none"
                                    />
                                    {max > 0 && <span className="text-[9px] text-slate-400 dark:text-dk-muted mt-0.5">/{max}</span>}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 relative">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Nom du Sous-traitant *',ar:'اسم المقاول من الباطن *',en:'Subcontractor Name *',es:'Nombre del Subcontratista *',pt:'Nome do Subcontratado *',tr:'Taşeron Adı *'})}</label>
                    {formSubcontractorName && subcontractorProfiles.some(p => p.name === formSubcontractorName) && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddModalOpen(false);
                          setActiveTab('subcontractors');
                          setSelectedSubcontractorName(formSubcontractorName);
                        }}
                        className="text-[10px] font-bold text-indigo-600 dark:text-dk-accent-text hover:underline flex items-center gap-0.5"
                      >
                        <span>{tx(lang,{fr:'Voir sa fiche',ar:'عرض ملفه',en:'View profile',es:'Ver ficha',pt:'Ver ficha',tr:'Profili gör'})}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSubPickerOpen(v => !v)}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white flex items-center gap-2.5"
                  >
                    {(() => {
                      const p = subcontractorProfiles.find(pp => pp.name === formSubcontractorName);
                      return p?.photo ? (
                        <img src={p.photo} alt={p.name} className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-dk-border" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                        </div>
                      );
                    })()}
                    <span className={`flex-1 text-left truncate ${formSubcontractorName ? '' : 'text-slate-400 dark:text-dk-muted'}`}>
                      {formSubcontractorName || tx(lang,{fr:'Choisir un sous-traitant',ar:'اختر مقاولاً من الباطن',en:'Choose a subcontractor',es:'Elegir un subcontratista',pt:'Escolher um subcontratado',tr:'Bir taşeron seçin'})}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0" />
                  </button>

                  {isSubPickerOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl shadow-lg dark:shadow-dk-elevated max-h-56 overflow-y-auto">
                      {subcontractorProfiles.length === 0 && (
                        <p className="px-3 py-2 text-[11px] text-slate-400 dark:text-dk-muted italic">
                          {tx(lang,{fr:'Aucun sous-traitant enregistré',ar:'لا يوجد مقاول من الباطن مسجّل',en:'No registered subcontractor',es:'Ningún subcontratista registrado',pt:'Nenhum subcontratado registado',tr:'Kayıtlı taşeron yok'})}
                        </p>
                      )}
                      {subcontractorProfiles.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setFormSubcontractorName(p.name);
                            setFormSubcontractorPhone(p.phone || '');
                            setFormSubcontractorRating(p.rating || 5);
                            setIsSubPickerOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-left border-b border-slate-100 dark:border-dk-border last:border-b-0"
                        >
                          {p.photo ? (
                            <img src={p.photo} alt={p.name} className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-dk-border" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                              <Users className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 dark:text-dk-text truncate">{p.name}</p>
                            <p className="text-[10px] text-slate-400 dark:text-dk-muted truncate">
                              {p.contactName || ''}{p.contactName && p.phone ? ' · ' : ''}{p.phone || ''}
                            </p>
                          </div>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => { setIsSubPickerOpen(false); openNewProfileModal(); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-indigo-50 dark:hover:bg-dk-accent/10 text-left text-indigo-600 dark:text-dk-accent-text border-t border-slate-100 dark:border-dk-border"
                      >
                        <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-dk-accent/20 flex items-center justify-center shrink-0">
                          <Plus className="w-4 h-4" />
                        </div>
                        <p className="font-bold">{tx(lang,{fr:'Nouveau sous-traitant',ar:'مقاول من الباطن جديد',en:'New subcontractor',es:'Nuevo subcontratista',pt:'Novo subcontratado',tr:'Yeni taşeron'})}</p>
                      </button>
                    </div>
                  )}
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

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Type de prestation',ar:'نوع الخدمة',en:'Service type',es:'Tipo de prestación',pt:'Tipo de prestação',tr:'Hizmet türü'})}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    {
                      mode: 'facon' as const,
                      title: tx(lang,{fr:'Façon',ar:'خياطة فقط',en:'Cut-Make',es:'Confección',pt:'Confeção',tr:'Fason'}),
                      desc: tx(lang,{fr:'Il coud seulement. Vous fournissez la matière → Coût = Matières + Prix.',ar:'كيخيّط فقط. المواد من عندك → التكلفة = المواد + الثمن.',en:'They only sew. You supply materials → Cost = Materials + Price.',es:'Solo cose. Usted aporta el material → Coste = Materiales + Precio.',pt:'Só costura. Você fornece o material → Custo = Materiais + Preço.',tr:'Sadece diker. Malzemeyi siz verirsiniz → Maliyet = Malzeme + Fiyat.'}),
                    },
                    {
                      mode: 'complet' as const,
                      title: tx(lang,{fr:'Tout compris',ar:'كلشي عليه',en:'All-inclusive',es:'Todo incluido',pt:'Tudo incluído',tr:'Her şey dahil'}),
                      desc: tx(lang,{fr:'Il fournit tout (matière + façon) → Coût = Prix seul.',ar:'كيوفّر كلشي (المواد + الخياطة) → التكلفة = الثمن فقط.',en:'They supply everything (materials + making) → Cost = Price only.',es:'Aporta todo (material + confección) → Coste = Solo el precio.',pt:'Fornece tudo (material + confeção) → Custo = Apenas o preço.',tr:'Her şeyi sağlar (malzeme + dikim) → Maliyet = Sadece fiyat.'}),
                    },
                  ].map(opt => {
                    const isActive = (formTissuFournisseur === 'SUBCONTRACTOR' ? 'complet' : 'facon') === opt.mode;
                    return (
                      <button
                        key={opt.mode}
                        type="button"
                        onClick={() => {
                          const asSub = opt.mode === 'complet' ? 'SUBCONTRACTOR' : 'CLIENT';
                          setFormTissuFournisseur(asSub);
                          setFormFournituresFournisseur(asSub);
                          setFormPrestationType(opt.mode === 'complet' ? 'CMT' : 'FACON_PURE');
                        }}
                        className={`text-left p-3 rounded-xl border transition-all ${isActive ? 'border-indigo-500 dark:border-dk-accent bg-indigo-50 dark:bg-dk-accent/20' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface hover:border-slate-300 dark:hover:border-dk-border'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-bold ${isActive ? 'text-indigo-700 dark:text-dk-accent-text' : 'text-slate-700 dark:text-dk-text-soft'}`}>{opt.title}</span>
                          {isActive && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-dk-accent-text shrink-0" />}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-1 leading-snug">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                <div className="space-y-1.5 col-span-2">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Total (MAD)',ar:'المجموع (MAD)',en:'Total (MAD)',es:'Total (MAD)',pt:'Total (MAD)',tr:'Toplam (MAD)'})}</label>
                  <div className="w-full bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text font-bold">
                    {(formTotalQuantity * formPricePerPiece).toLocaleString()} MAD
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
      {/* EDIT ORDER MODAL */}
      {/* ======================================= */}
      {isEditModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] z-[200] flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative my-auto bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50 dark:bg-dk-surface/50">
              <h2 className="font-bold text-slate-800 dark:text-dk-text text-base flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent" />
                <span>{tx(lang,{fr:'Modifier la Commande de Sous-traitance',ar:'تعديل أمر المقاولة من الباطن',en:'Edit Subcontract Order',es:'Editar Pedido de Subcontratación',pt:'Editar Encomenda de Subcontratação',tr:'Taşeron Siparişini Düzenle'})}</span>
              </h2>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-650 dark:hover:text-dk-text-soft">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditOrder} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-600 dark:text-dk-text-soft">
              {(
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
                        onChange={(e) => setFormSubcontractorPhone(formatPhoneInput(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent dark:border-dk-accent focus:bg-white"
                        placeholder="06 XX XX XX XX"
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

                    {gridEstimated && (
                      <div className="flex items-start gap-2 px-3 py-2 mb-2 rounded-xl bg-amber-50 dark:bg-amber-900/25 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="text-[10px] font-semibold leading-relaxed">
                          {tx(lang,{
                            fr:"Grille estimée : cette commande a été créée avant l'enregistrement du détail couleur × taille. Le total est exact, mais la répartition par couleur est à vérifier avant d'enregistrer.",
                            ar:'شبكة تقديرية: هذا الأمر أُنشئ قبل تسجيل تفصيل اللون × المقاس. المجموع صحيح، لكن التوزيع حسب اللون يحتاج تحقّقاً قبل الحفظ.',
                            en:'Estimated grid: this order predates color × size detail storage. The total is exact, but the per-color split must be checked before saving.',
                            es:'Cuadrícula estimada: este pedido es anterior al guardado del detalle color × talla. El total es exacto, pero revise el reparto por color antes de guardar.',
                            pt:'Grelha estimada: esta encomenda é anterior ao registo do detalhe cor × tamanho. O total está correto, mas verifique a repartição por cor antes de guardar.',
                            tr:'Tahmini tablo: bu sipariş, renk × beden detayının kaydedilmesinden önce oluşturuldu. Toplam doğru, ancak renk dağılımını kaydetmeden önce kontrol edin.'
                          })}
                        </span>
                      </div>
                    )}
                    {Object.keys(batches[0].grid).length === 0 ? (
                      <p className="text-[11px] text-slate-500 dark:text-dk-muted italic">{tx(lang,{fr:'Aucune couleur configurée. Le lot sera traité de manière globale.',ar:'لم يتم تكوين أي لون. سيتم معالجة الدفعة بشكل إجمالي.',en:'No color configured. The batch will be processed globally.',es:'Ningún color configurado. El lote se procesará de forma global.',pt:'Nenhuma cor configurada. O lote será processado globalmente.',tr:'Hiçbir renk yapılandırılmadı. Parti genel olarak işlenecek.'})}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted font-bold">
                              <th className="py-2 pr-4">{tx(lang,{fr:'Couleur',ar:'اللون',en:'Color',es:'Color',pt:'Cor',tr:'Renk'})}</th>
                              {editGridSizes.map(sz => <th key={sz} className="py-2 px-1 text-center">{sz}</th>)}
                              <th className="py-2 text-right">{tx(lang,{fr:'Action',ar:'إجراء',en:'Action',es:'Acción',pt:'Ação',tr:'İşlem'})}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                            {Object.entries(batches[0].grid).map(([color, sizesObj]) => (
                              <tr key={color}>
                                <td className="py-2 pr-4 font-semibold text-slate-700 dark:text-dk-text-soft">{color}</td>
                                {editGridSizes.map(sz => (
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

              <div className="flex gap-3 justify-between items-center border-t border-slate-150 dark:border-dk-border pt-4 mt-6">
                <button
                  type="button"
                  onClick={async () => { await handleDeleteOrder(selectedOrder.id); setIsEditModalOpen(false); }}
                  className="px-4 py-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-rose-200 dark:hover:border-rose-800/50"
                >
                  {tx(lang,{fr:'Supprimer la commande',ar:'حذف الطلبية',en:'Delete order',es:'Eliminar pedido',pt:'Eliminar encomenda',tr:'Siparişi sil'})}
                </button>
                <div className="flex gap-3">
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
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* DETAILED VIEW MODAL */}
      {/* ======================================= */}
      {isDetailModalOpen && detailOrder && (
        <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="relative my-auto bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-750 dark:text-dk-text">
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

              {/* Jalons — mêmes contrôles que sur la carte, en plus grand */}
              <div className="bg-slate-50 dark:bg-dk-bg/75 border border-slate-150 dark:border-dk-border rounded-xl p-4 space-y-2.5">
                <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px] tracking-wide">
                  {tx(lang,{fr:'Jalons — cliquer pour basculer',ar:'المراحل — انقر للتبديل',en:'Milestones — click to toggle',es:'Hitos — clic para alternar',pt:'Marcos — clique para alternar',tr:'Kilometre taşları — değiştirmek için tıklayın'})}
                </span>
                <div className="flex flex-wrap gap-2">
                  {milestoneChips(detailOrder, 'md').map(chip => (
                    <MilestoneChip key={chip.field} {...chip} onToggle={() => handleToggleMilestone(detailOrder, chip.field)} />
                  ))}
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
        <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="relative my-auto bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] text-slate-850 dark:text-dk-text">
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

      {/* ======================================= */}
      {/* IMAGE LIGHTBOX PREVIEW */}
      {/* ======================================= */}
      {imagePreviewSrc && (
        <div
          className="fixed inset-0 bg-black/80 z-[220] flex items-center justify-center p-6"
          onClick={() => setImagePreviewSrc(null)}
        >
          <button
            onClick={() => setImagePreviewSrc(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img src={imagePreviewSrc} alt="" className="max-w-full max-h-full rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* ======================================= */}
      {/* SUBCONTRACTOR PROFILE MODAL */}
      {/* ======================================= */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] z-[210] flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative my-auto bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50">
              <h2 className="font-bold text-slate-800 dark:text-dk-text text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600 dark:text-dk-accent-text" />
                <span>{editingProfile
                  ? tx(lang,{fr:'Modifier le Sous-traitant',ar:'تعديل المقاول من الباطن',en:'Edit Subcontractor',es:'Editar Subcontratista',pt:'Editar Subcontratado',tr:'Taşeronu Düzenle'})
                  : tx(lang,{fr:'Nouveau Sous-traitant',ar:'مقاول من الباطن جديد',en:'New Subcontractor',es:'Nuevo Subcontratista',pt:'Novo Subcontratado',tr:'Yeni Taşeron'})}</span>
              </h2>
              <button onClick={() => setIsProfileModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveProfile} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs text-slate-600 dark:text-dk-text-soft">
              <div className="flex items-center gap-4">
                <div className="shrink-0 space-y-1.5">
                  <label className="relative block cursor-pointer group">
                    {profileFormPhoto ? (
                      <img src={profileFormPhoto} alt="" className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-dk-border" />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-dk-elevated border border-dashed border-slate-300 dark:border-dk-border flex items-center justify-center">
                        <Users className="w-6 h-6 text-slate-400 dark:text-dk-muted" />
                      </div>
                    )}
                    <div className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold">
                      {tx(lang,{fr:'Changer',ar:'تغيير',en:'Change',es:'Cambiar',pt:'Alterar',tr:'Değiştir'})}
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleProfileFileUpload(e, setProfileFormPhoto)} />
                  </label>
                  {profileFormPhoto && (
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setImagePreviewSrc(profileFormPhoto)}
                        className="p-1 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:hover:text-dk-accent-text transition-colors"
                        title={tx(lang,{fr:'Voir en grand',ar:'عرض بحجم كبير',en:'View full size',es:'Ver en grande',pt:'Ver ampliado',tr:'Büyük görüntüle'})}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadDocument(profileFormPhoto, `photo-${profileFormName || 'sous-traitant'}`)}
                        className="p-1 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:hover:text-dk-accent-text transition-colors"
                        title={tx(lang,{fr:'Télécharger',ar:'تنزيل',en:'Download',es:'Descargar',pt:'Descarregar',tr:'İndir'})}
                      >
                        <ArrowRight className="w-3.5 h-3.5 rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfileFormPhoto('')}
                        className="p-1 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                        title={tx(lang,{fr:'Retirer',ar:'إزالة',en:'Remove',es:'Quitar',pt:'Remover',tr:'Kaldır'})}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:"Nom de l'atelier / usine *",ar:'اسم الورشة / المصنع *',en:'Workshop / factory name *',es:'Nombre del taller / fábrica *',pt:'Nome da oficina / fábrica *',tr:'Atölye / fabrika adı *'})}</label>
                  <input
                    type="text"
                    value={profileFormName}
                    onChange={(e) => setProfileFormName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
                    placeholder={tx(lang,{fr:'Atelier externe',ar:'ورشة خارجية',en:'External workshop',es:'Taller externo',pt:'Oficina externa',tr:'Harici atölye'})}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Nom du sous-traitant (contact)',ar:'اسم المقاول من الباطن (المسؤول)',en:'Subcontractor name (contact)',es:'Nombre del subcontratista (contacto)',pt:'Nome do subcontratado (contacto)',tr:'Taşeron adı (irtibat)'})}</label>
                <input
                  type="text"
                  value={profileFormContactName}
                  onChange={(e) => setProfileFormContactName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
                  placeholder={tx(lang,{fr:'Nom & prénom du responsable',ar:'اسم ونسب المسؤول',en:'Manager full name',es:'Nombre completo del responsable',pt:'Nome completo do responsável',tr:'Sorumlunun tam adı'})}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:"Carte d'identité (recto / verso)",ar:'البطاقة الوطنية (وجه / ظهر)',en:'ID card (front / back)',es:'DNI (anverso / reverso)',pt:'Cartão de identidade (frente / verso)',tr:'Kimlik kartı (ön / arka)'})}</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: tx(lang,{fr:'Recto',ar:'الوجه',en:'Front',es:'Anverso',pt:'Frente',tr:'Ön'}), value: profileFormCinRecto, setter: setProfileFormCinRecto },
                    { label: tx(lang,{fr:'Verso',ar:'الظهر',en:'Back',es:'Reverso',pt:'Verso',tr:'Arka'}), value: profileFormCinVerso, setter: setProfileFormCinVerso },
                  ].map((slot, idx) => (
                    <div key={idx} className="space-y-1.5">
                      {slot.value ? (
                        <button
                          type="button"
                          onClick={() => openDocument(slot.value)}
                          className="w-full block text-left"
                        >
                          {slot.value.startsWith('data:image') ? (
                            <img src={slot.value} alt={slot.label} className="w-full h-24 object-cover rounded-xl border border-slate-200 dark:border-dk-border" />
                          ) : (
                            <div className="w-full h-24 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg flex flex-col items-center justify-center gap-1">
                              <FileText className="w-5 h-5 text-slate-400 dark:text-dk-muted" />
                              <span className="text-[9px] text-slate-400 dark:text-dk-muted px-1.5 text-center break-all line-clamp-2" title={originalFileName(slot.value) || undefined}>{originalFileName(slot.value) || `PDF · ${slot.label}`}</span>
                            </div>
                          )}
                        </button>
                      ) : (
                        <label className="cursor-pointer block">
                          <div className="w-full h-24 rounded-xl border border-dashed border-slate-300 dark:border-dk-border bg-slate-50 dark:bg-dk-bg flex flex-col items-center justify-center gap-1 hover:border-indigo-400 dark:hover:border-dk-accent transition-colors">
                            <Plus className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                            <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{slot.label}</span>
                          </div>
                          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleProfileFileUpload(e, slot.setter)} />
                        </label>
                      )}

                      {slot.value && (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openDocument(slot.value)}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:hover:text-dk-accent-text transition-colors"
                            title={tx(lang,{fr:'Ouvrir',ar:'فتح',en:'Open',es:'Abrir',pt:'Abrir',tr:'Aç'})}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadDocument(slot.value, `CIN-${slot.label}-${profileFormName || 'sous-traitant'}`)}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:hover:text-dk-accent-text transition-colors"
                            title={tx(lang,{fr:'Télécharger',ar:'تنزيل',en:'Download',es:'Descargar',pt:'Descarregar',tr:'İndir'})}
                          >
                            <ArrowRight className="w-3.5 h-3.5 rotate-90" />
                          </button>
                          <label className="p-1.5 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:hover:text-dk-accent-text transition-colors cursor-pointer" title={tx(lang,{fr:'Remplacer',ar:'استبدال',en:'Replace',es:'Reemplazar',pt:'Substituir',tr:'Değiştir'})}>
                            <Edit2 className="w-3.5 h-3.5" />
                            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleProfileFileUpload(e, slot.setter)} />
                          </label>
                          <button
                            type="button"
                            onClick={() => slot.setter('')}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                            title={tx(lang,{fr:'Retirer',ar:'إزالة',en:'Remove',es:'Quitar',pt:'Remover',tr:'Kaldır'})}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Téléphone',ar:'الهاتف',en:'Phone',es:'Teléfono',pt:'Telefone',tr:'Telefon'})}</label>
                  <input
                    type="text"
                    value={profileFormPhone}
                    onChange={(e) => setProfileFormPhone(formatPhoneInput(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
                    placeholder="06 XX XX XX XX"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'CIN',ar:'البطاقة الوطنية',en:'National ID',es:'CIN',pt:'CIN',tr:'Kimlik No'})}</label>
                  <input
                    type="text"
                    value={profileFormCin}
                    onChange={(e) => setProfileFormCin(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Adresse',ar:'العنوان',en:'Address',es:'Dirección',pt:'Morada',tr:'Adres'})}</label>
                <input
                  type="text"
                  value={profileFormAddress}
                  onChange={(e) => setProfileFormAddress(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">ICE</label>
                  <input
                    type="text"
                    value={profileFormIce}
                    onChange={(e) => setProfileFormIce(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">RC</label>
                  <input
                    type="text"
                    value={profileFormRc}
                    onChange={(e) => setProfileFormRc(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Évaluation',ar:'التقييم',en:'Rating',es:'Evaluación',pt:'Avaliação',tr:'Değerlendirme'})}</label>
                  <select
                    value={profileFormRating}
                    onChange={(e) => setProfileFormRating(parseFloat(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:bg-white"
                  >
                    <option value="5">★★★★★</option>
                    <option value="4">★★★★☆</option>
                    <option value="3">★★★☆☆</option>
                    <option value="2">★★☆☆☆</option>
                    <option value="1">★☆☆☆☆</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Notes',ar:'ملاحظات',en:'Notes',es:'Notas',pt:'Notas',tr:'Notlar'})}</label>
                <textarea
                  value={profileFormNotes}
                  onChange={(e) => setProfileFormNotes(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 outline-none h-16 text-slate-800 dark:text-dk-text focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
                />
              </div>

              <div className="flex gap-3 justify-between items-center border-t border-slate-150 dark:border-dk-border pt-4">
                {editingProfile ? (
                  <button
                    type="button"
                    onClick={async () => { await handleDeleteProfile(editingProfile.id); setIsProfileModalOpen(false); }}
                    className="px-4 py-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-rose-200 dark:hover:border-rose-800/50"
                  >
                    {tx(lang,{fr:'Supprimer le sous-traitant',ar:'حذف المقاول من الباطن',en:'Delete subcontractor',es:'Eliminar subcontratista',pt:'Eliminar subcontratado',tr:'Taşeronu sil'})}
                  </button>
                ) : <span />}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsProfileModalOpen(false)}
                    className="px-5 py-2.5 border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-slate-500 dark:text-dk-muted rounded-xl font-bold transition-all"
                  >
                    {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md flex items-center gap-2"
                  >
                    {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{tx(lang,{fr:'Enregistrer',ar:'حفظ',en:'Save',es:'Guardar',pt:'Guardar',tr:'Kaydet'})}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* MODEL INFO POPUP (from Bibliothèque) */}
      {/* ======================================= */}
      {modelInfoTarget && (
        <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] z-[210] flex items-center justify-center p-4" onClick={() => setModelInfoTarget(null)}>
          <div
            className="bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50">
              <h2 className="font-bold text-slate-800 dark:text-dk-text text-base">{modelInfoTarget.meta_data.nom_modele}</h2>
              <button onClick={() => setModelInfoTarget(null)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {modelInfoTarget.image && (
                <img src={modelInfoTarget.image} alt={modelInfoTarget.meta_data.nom_modele} className="w-full max-h-72 object-contain rounded-2xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg" />
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-3 border border-slate-200 dark:border-dk-border">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'Référence',ar:'المرجع',en:'Reference',es:'Referencia',pt:'Referência',tr:'Referans'})}</p>
                  <p className="font-semibold text-slate-800 dark:text-dk-text">{modelInfoTarget.meta_data.reference || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-3 border border-slate-200 dark:border-dk-border">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'Catégorie',ar:'الفئة',en:'Category',es:'Categoría',pt:'Categoria',tr:'Kategori'})}</p>
                  <p className="font-semibold text-slate-800 dark:text-dk-text">{modelInfoTarget.meta_data.category || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-3 border border-slate-200 dark:border-dk-border">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})}</p>
                  <p className="font-semibold text-slate-800 dark:text-dk-text">{modelInfoTarget.meta_data.quantity?.toLocaleString() || 0} pcs</p>
                </div>
                <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-3 border border-slate-200 dark:border-dk-border">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang,{fr:'Date de création',ar:'تاريخ الإنشاء',en:'Creation date',es:'Fecha de creación',pt:'Data de criação',tr:'Oluşturma tarihi'})}</p>
                  <p className="font-semibold text-slate-800 dark:text-dk-text">{modelInfoTarget.meta_data.date_creation ? new Date(modelInfoTarget.meta_data.date_creation).toLocaleDateString() : 'N/A'}</p>
                </div>
              </div>
              {modelInfoTarget.meta_data.sizes && modelInfoTarget.meta_data.sizes.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-1.5">{tx(lang,{fr:'Tailles',ar:'المقاسات',en:'Sizes',es:'Tallas',pt:'Tamanhos',tr:'Bedenler'})}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {modelInfoTarget.meta_data.sizes.map(sz => (
                      <span key={sz} className="px-2 py-1 bg-slate-100 dark:bg-dk-elevated rounded-lg text-slate-700 dark:text-dk-text-soft font-semibold">{sz}</span>
                    ))}
                  </div>
                </div>
              )}
              {modelInfoTarget.meta_data.colors && modelInfoTarget.meta_data.colors.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-1.5">{tx(lang,{fr:'Couleurs',ar:'الألوان',en:'Colors',es:'Colores',pt:'Cores',tr:'Renkler'})}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {modelInfoTarget.meta_data.colors.map(c => (
                      <span key={c.id} className="px-2 py-1 bg-slate-100 dark:bg-dk-elevated rounded-lg text-slate-700 dark:text-dk-text-soft font-semibold">{c.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
