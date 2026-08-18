import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ModelData, SubcontractOrder, PlanningEvent, SubcontractorProfile, DEFAULT_COMMERCIAL_SETTINGS } from '../types';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';
import { resolveStock, MagasinItem } from '../lib/magasinMatch';
import { fmt } from '../app/constants';
import { computeModelCostPrice, prixPlancher, estSousPlancher, SOUS_COUT_NOTE_PREFIX } from '../lib/costPrice';
import { resolveCommercialAccess } from '../app/accessControl';
import { useAuth } from '../src/context/AuthContext';
import { usePermissions } from '../src/context/PermissionsContext';
import { diffOrderVsModelGrid } from '../utils/subcontractGrid';
import InlineInvoiceList from './InlineInvoiceList';
import FactureUploader from './FactureUploader';
import ClientsPanel, { AtelierClient } from './soustraitance/ClientsPanel';
import EntitySheet, { SheetTarget } from './soustraitance/EntitySheet';
import { 
  Truck, Plus, Search, Trash2, Edit2, X, Check, 
  AlertCircle, Calendar, DollarSign, Package, 
  ChevronDown, ChevronUp, Loader2, Info, Eye, Layers, Palette,
  Printer, CheckSquare, Clock, ShieldCheck, ClipboardCheck, Sparkles, Send, Copy, Coins, Save,
  Users, Building2, EyeOff, LayoutGrid, FileText, Settings, ArrowRight, Star, ChevronRight,
  AlertTriangle, Scissors, Lock, PanelLeftClose, PanelLeftOpen, Pencil, Table,
  Receipt, Warehouse
} from 'lucide-react';

/** Mode statique (Vercel / build sans Express) : aucune API `/api/*` n'existe.
 *  Les écritures modèle passent alors par `setModels`, qui persiste côté client. */
const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

interface SousTraitanceProps {
  models: ModelData[];
  setModels?: React.Dispatch<React.SetStateAction<ModelData[]>>;
  settings?: any;
  onNavigate?: (view: string) => void;
  /** Ouvre un modèle vierge en gardant la sous-traitance comme point de retour.
   *  Sans ce prop, on se rabat sur une simple navigation vers la bibliothèque. */
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

/** Sélecteur de modèle avec vignette photo. Partagé par les modales d'ajout et d'édition. */
const ModelPickerField: React.FC<{
  lang: string;
  models: ModelData[];
  value: string;
  open: boolean;
  setOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  onSelect: (id: string) => void;
  /** Verrouille le choix — utilisé à l'ÉDITION d'une commande. Le modèle porte
   *  désormais le tarif, les frais et la quantité de SA commande dans sa fiche de
   *  coût : le rebrancher ailleurs laisserait l'ancien modèle avec un prix de
   *  revient qui ne correspond plus à aucune commande. Le champ reste visible,
   *  car savoir de quel modèle il s'agit fait partie de la lecture de la fiche. */
  locked?: boolean;
}> = ({ lang, models, value, open, setOpen, onSelect, locked = false }) => {
  const manualLabel = tx(lang as any,{fr:'Saisie Manuelle (Sans modèle existant)',ar:'إدخال يدوي (بدون موديل موجود)',en:'Manual Entry (No existing model)',es:'Entrada Manual (Sin modelo existente)',pt:'Inserção Manual (Sem modelo existente)',tr:'Manuel Giriş (Mevcut model yok)'});
  const selected = models.find(m => m.id === value);
  const thumb = (src?: string, alt?: string, s = 'w-8 h-8') => src
    ? <img src={src} alt={alt || ''} className={`${s} rounded-lg object-cover shrink-0 border border-slate-200 dark:border-dk-border`} />
    : <div className={`${s} rounded-lg bg-slate-200 dark:bg-dk-elevated flex items-center justify-center shrink-0`}><Package className="w-4 h-4 text-slate-400 dark:text-dk-muted" /></div>;

  return (
    <div className="space-y-1.5 relative">
      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang as any,{fr:'Modèle *',ar:'الموديل *',en:'Model *',es:'Modelo *',pt:'Modelo *',tr:'Model *'})}</label>
      <button
        type="button"
        onClick={() => { if (!locked) setOpen(v => !v); }}
        disabled={locked}
        title={locked ? tx(lang as any,{fr:"Le modèle d'une commande existante ne peut pas être changé : sa fiche de coût est liée à cette commande.",ar:'موديل أمر موجود ما يتبدّلش: فيش التكلفة ديالو مربوطة بهاد الأمر.',en:'The model of an existing order cannot be changed: its cost sheet is linked to this order.',es:'El modelo de un pedido existente no se puede cambiar: su ficha de coste está vinculada a este pedido.',pt:'O modelo de uma encomenda existente não pode ser alterado: a sua ficha de custo está ligada a esta encomenda.',tr:'Mevcut bir siparişin modeli değiştirilemez: maliyet kartı bu siparişe bağlıdır.'}) : undefined}
        className={`w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-slate-800 dark:text-dk-text outline-none flex items-center gap-2.5 ${locked ? 'cursor-not-allowed opacity-70' : 'focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white'}`}
      >
        {value === 'MANUAL' ? thumb(undefined) : thumb(selected?.image, selected?.meta_data?.nom_modele)}
        <span className="flex-1 text-left truncate">
          {value === 'MANUAL'
            ? manualLabel
            : (selected?.meta_data?.nom_modele || tx(lang as any,{fr:'Sélectionner un modèle',ar:'اختر موديل',en:'Select a model',es:'Seleccionar un modelo',pt:'Selecionar um modelo',tr:'Bir model seçin'}))}
        </span>
        {locked
          ? <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0" strokeWidth={1.75} />
          : <ChevronDown className="w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0" />}
      </button>

      {locked && (
        <p className="text-[10px] text-slate-400 dark:text-dk-muted leading-snug">
          {tx(lang as any,{fr:'Modèle verrouillé — sa fiche de coût est liée à cette commande.',ar:'الموديل مقفول — فيش التكلفة ديالو مربوطة بهاد الأمر.',en:'Model locked — its cost sheet is linked to this order.',es:'Modelo bloqueado — su ficha de coste está vinculada a este pedido.',pt:'Modelo bloqueado — a sua ficha de custo está ligada a esta encomenda.',tr:'Model kilitli — maliyet kartı bu siparişe bağlı.'})}
        </p>
      )}

      {open && !locked && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl shadow-lg max-h-64 overflow-y-auto">
          {models.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onSelect(m.id); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-left border-b border-slate-100 dark:border-dk-border last:border-b-0 ${m.id === value ? 'bg-indigo-50 dark:bg-dk-elevated' : ''}`}
            >
              {thumb(m.image, m.meta_data.nom_modele, 'w-9 h-9')}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 dark:text-dk-text truncate">{m.meta_data.nom_modele}</p>
                <p className="text-[10px] text-slate-400 dark:text-dk-muted truncate">
                  {m.meta_data.reference || tx(lang as any,{fr:'Aucune ref',ar:'لا يوجد مرجع',en:'No ref',es:'Sin ref',pt:'Sem ref',tr:'Referans yok'})}
                  {m.meta_data.date_creation ? ` · ${new Date(m.meta_data.date_creation).toLocaleDateString()}` : ''}
                </p>
              </div>
              {m.id === value && <Check className="w-4 h-4 text-indigo-500 dark:text-dk-accent shrink-0" />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { onSelect('MANUAL'); setOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-left ${value === 'MANUAL' ? 'bg-indigo-50 dark:bg-dk-elevated' : ''}`}
          >
            {thumb(undefined, '', 'w-9 h-9')}
            <p className="flex-1 font-semibold text-slate-800 dark:text-dk-text">{manualLabel}</p>
            {value === 'MANUAL' && <Check className="w-4 h-4 text-indigo-500 dark:text-dk-accent shrink-0" />}
          </button>
        </div>
      )}
    </div>
  );
};

/** Badge indiquant si le prix matière vient du magasin (fiable) ou d'une saisie
 *  manuelle dans la fiche de coût (l'article n'est pas référencé au stock). */
const MaterialPriceBadge: React.FC<{ source: 'stock' | 'manuel'; lang: string }> = ({ source, lang }) => (
  <span
    className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide align-middle ${source === 'stock' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'}`}
    title={source === 'stock'
      ? tx(lang as any,{fr:'Prix issu du magasin (CUMP/catalogue)',ar:'الثمن من المخزون (CUMP/الكتالوج)',en:'Price from stock (CUMP/catalog)',es:'Precio del almacén (CUMP/catálogo)',pt:'Preço do armazém (CUMP/catálogo)',tr:'Depo fiyatı (CUMP/katalog)'})
      : tx(lang as any,{fr:"Prix saisi manuellement dans la fiche de coût (article absent du magasin)",ar:'ثمن مُدخَل يدوياً في بطاقة التكلفة (المادة غير موجودة بالمخزون)',en:'Manually entered in the cost sheet (item not in stock)',es:'Introducido manualmente en la ficha de coste (artículo sin stock)',pt:'Inserido manualmente na ficha de custo (artigo sem stock)',tr:'Maliyet formuna elle girildi (ürün depoda yok)'})}
  >
    {source === 'stock'
      ? tx(lang as any,{fr:'Stock',ar:'مخزون',en:'Stock',es:'Stock',pt:'Stock',tr:'Stok'})
      : tx(lang as any,{fr:'Manuel',ar:'يدوي',en:'Manual',es:'Manual',pt:'Manual',tr:'Manuel'})}
  </span>
);

/** Où le modèle est-il coupé pour CETTE commande ?
 *  `SUBCONTRACTOR` (défaut) = comportement historique : la matière brute part
 *  telle quelle et le sous-traitant coupe. `INTERNAL` = la coupe est faite chez
 *  vous, ce sont des pièces déjà coupées qui sont expédiées.
 *  Ce champ n'entre dans AUCUN calcul : il n'adapte que les libellés du bon
 *  d'envoi et une note dans la fiche. */
type CoupeLocation = 'INTERNAL' | 'SUBCONTRACTOR';

/** Lecture tolérante du champ : le back peut le restituer en camelCase ou en
 *  snake_case, et il est absent des commandes créées avant son introduction.
 *  Toute valeur inconnue retombe sur `SUBCONTRACTOR`, qui est le comportement
 *  implicite d'avant — on ne requalifie pas une commande sans preuve. */
const readCoupeLocation = (o: any): CoupeLocation =>
  (o?.coupeLocation ?? o?.coupe_location) === 'INTERNAL' ? 'INTERNAL' : 'SUBCONTRACTOR';

/** Jalon libre ajouté par l'utilisateur, en plus des 4 jalons fixes
 *  (Tissu/Fournitures/FT/Proto) qui restent inchangés — ceux-là portent une
 *  signification métier précise (statuts consommés ailleurs). Les jalons
 *  personnalisés sont une simple checklist libre par commande. */
interface CustomMilestone { id: string; label: string; done: boolean }

/** Palette tournante pour distinguer visuellement les jalons libres entre eux
 *  (contrairement aux 4 jalons fixes, ils n'ont pas de couleur métier dédiée).
 *  La couleur est dérivée de l'id, donc stable tant que le jalon n'est pas
 *  supprimé/recréé. */
const CUSTOM_MILESTONE_COLORS = [
  'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50',
  'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800/50',
  'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/50',
  'bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-800/50',
  'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/50',
  'bg-lime-50 dark:bg-lime-950/30 text-lime-700 dark:text-lime-400 border-lime-200 dark:border-lime-800/50',
];
const customMilestoneColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CUSTOM_MILESTONE_COLORS[hash % CUSTOM_MILESTONE_COLORS.length];
};

const readCustomMilestones = (o: any): CustomMilestone[] => {
  const raw = o?.custom_milestones_json ?? o?.customMilestonesJson;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(m => m && typeof m.id === 'string' && typeof m.label === 'string');
  } catch {
    return [];
  }
};

/** Sélecteur « Parcours de coupe » — même langage visuel que « Type de
 *  prestation » : deux cartes cliquables titre + description. Partagé par les
 *  modales d'ajout et d'édition. */
const CoupeLocationField: React.FC<{
  lang: string;
  value: CoupeLocation;
  onChange: (v: CoupeLocation) => void;
}> = ({ lang, value, onChange }) => {
  const options: { mode: CoupeLocation; title: string; desc: string }[] = [
    {
      mode: 'INTERNAL',
      title: tx(lang as any,{fr:'Coupe interne',ar:'القص عندكم',en:'In-house cutting',es:'Corte interno',pt:'Corte interno',tr:'Şirket içi kesim'}),
      desc: tx(lang as any,{
        fr:"Le modèle est coupé chez vous avant l'envoi. Vous expédiez des pièces déjà coupées.",
        ar:'الموديل كيتقطّع عندكم قبل الإرسال. كتصيفطو قطع مقطوعة من قبل.',
        en:'The model is cut in-house before shipping. You send already-cut pieces.',
        es:'El modelo se corta en su taller antes del envío. Usted expide piezas ya cortadas.',
        pt:'O modelo é cortado na sua oficina antes do envio. Você expede peças já cortadas.',
        tr:'Model gönderimden önce sizde kesilir. Kesilmiş parçaları sevk edersiniz.',
      }),
    },
    {
      mode: 'SUBCONTRACTOR',
      title: tx(lang as any,{fr:'Coupe chez le sous-traitant',ar:'القص عند المقاول من الباطن',en:'Cutting at the subcontractor',es:'Corte en el subcontratista',pt:'Corte no subcontratado',tr:'Taşeronda kesim'}),
      desc: tx(lang as any,{
        fr:'La matière brute est expédiée telle quelle. Le sous-traitant coupe lui-même.',
        ar:'المادة الخام كتصيفط كيف ما هي. المقاول من الباطن هو اللي كيقطّع.',
        en:'The raw fabric is shipped as is. The subcontractor does the cutting.',
        es:'La materia prima se envía tal cual. El subcontratista corta él mismo.',
        pt:'A matéria-prima é expedida tal como está. O subcontratado corta ele próprio.',
        tr:'Ham kumaş olduğu gibi gönderilir. Kesimi taşeron yapar.',
      }),
    },
  ];

  return (
    <div className="space-y-1.5">
      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
        {tx(lang as any,{fr:'Parcours de coupe',ar:'مسار القص',en:'Cutting route',es:'Recorrido de corte',pt:'Percurso de corte',tr:'Kesim rotası'})}
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {options.map(opt => {
          const isActive = value === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => onChange(opt.mode)}
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
  );
};

/** Frais additionnel libre rattaché à une commande de sous-traitance.
 *  `quantity_scope` à `null` = le frais porte sur toute la commande ; sinon il
 *  ne couvre que ce nombre de pièces. Le libellé est 100% libre. */
interface SubcontractExpense {
  id: string;
  order_id: string;
  label: string;
  amount: number;
  quantity_scope: number | null;
  created_at?: string;
}

/** Identité légale de l'entreprise émettrice (VOUS), affichée en tête de la
 *  facture de sous-traitance. Source CANONIQUE et unique : `GET
 *  /api/permissions/company` (édition dans Admin > Entreprise, réservée au
 *  super-admin). Cette page ne fait que la LIRE — dupliquer ces champs ailleurs
 *  ferait diverger l'ICE d'une facture à l'autre. */
interface CompanyIdentity {
  nom: string;
  ice: string;
  rc: string;
  adresse: string;
  tel: string;
  /** Logo de l'entreprise (data-URL), tel qu'enregistré dans Admin > Entreprise. */
  logo: string;
}

const EMPTY_COMPANY_IDENTITY: CompanyIdentity = { nom: '', ice: '', rc: '', adresse: '', tel: '', logo: '' };

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
  const lower = name.toLowerCase().normalize('NFD').replace(new RegExp('[\u0300-\u036f]', 'g'), '');
  const found = Object.entries(KNOWN_COLOR_KEYWORDS).find(([kw]) => lower.includes(kw.normalize('NFD').replace(new RegExp('[\u0300-\u036f]', 'g'), '')));
  if (found) return found[1];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

/** Locale d'affichage par langue : les dates suivent la langue active, elles ne
 *  sont plus figées en 'fr-FR'. */
const DATE_LOCALES: Record<string, string> = {
  fr: 'fr-FR', ar: 'ar-MA', en: 'en-GB', es: 'es-ES', pt: 'pt-PT', tr: 'tr-TR',
};

/** Montant d'une ligne de facture : saisissable, avec retour possible à la
 *  valeur calculée. Le point-clé est de ne JAMAIS perdre le calcul d'origine :
 *  tant que l'utilisateur n'a rien tapé, la cellule affiche ce que l'application
 *  a calculé ; dès qu'il tape, un point coloré et un bouton « ↺ » disent que la
 *  valeur est manuelle et permettent de revenir en arrière. */
const MoneyCell: React.FC<{
  value: number;
  edited: boolean;
  currency: string;
  onChange: (v: number) => void;
  onReset: () => void;
}> = ({ value, edited, currency, onChange, onReset }) => (
  <span className="inline-flex items-center gap-1 justify-end">
    {edited && (
      <button
        type="button"
        onClick={onReset}
        title="Revenir à la valeur calculée"
        className="text-[9px] text-amber-600 dark:text-amber-400 hover:text-amber-700"
      >
        ↺
      </button>
    )}
    <input
      type="number"
      step="0.01"
      value={Number.isFinite(value) ? value : 0}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={`w-20 text-right bg-transparent border-b border-dashed outline-none px-0.5 ${
        edited ? 'border-amber-400 text-amber-700 dark:text-amber-400' : 'border-slate-300 dark:border-dk-border focus:border-indigo-500'
      }`}
    />
    <span className="text-slate-400 dark:text-dk-muted">{currency}</span>
  </span>
);

/** Mode de sous-traitance. `facon` = le sous-traitant coud seulement (coût =
 *  matières + prix) ; `complet` = il fournit tout (coût = prix seul). */
type StMode = 'facon' | 'complet';

/** Valeur INITIALE du sélecteur de mode, déduite de la commande — jamais une
 *  décision finale : l'utilisateur tranche via le sélecteur explicite.
 *  `complet` n'est retenu que si le sous-traitant fournit À LA FOIS le tissu et
 *  les fournitures (et, quand l'information existe, le conditionnement).
 *  Tout cas ambigu retombe sur `facon`, qui ajoute les matières au coût :
 *  sous-estimer le coût de revient ferait vendre à perte, le surestimer n'est
 *  que prudent. */
const inferSubcontractMode = (o: {
  tissuFournisseur?: string | null;
  fournituresFournisseur?: string | null;
  conditionnementFournisseur?: string | null;
  prestationType?: string | null;
}): StMode => {
  const allSub =
    o.tissuFournisseur === 'SUBCONTRACTOR' &&
    o.fournituresFournisseur === 'SUBCONTRACTOR' &&
    (o.conditionnementFournisseur == null || o.conditionnementFournisseur === 'SUBCONTRACTOR');
  return allSub ? 'complet' : 'facon';
};

/* `modelCommandeQty` et `computeModelCostPrice` vivent désormais dans
   `lib/costPrice.ts` : le serveur applique le MÊME garde-fou de vente à perte,
   et deux copies d'une formule financière finissent toujours par diverger. */

/**
 * Script d'auto-ajustement injecté dans les documents imprimés.
 *
 * Le contenu d'une facture varie du simple au triple : 3 lignes pour une façon
 * seule, 30 pour une commande multi-matières. Une mise en page figée finit donc
 * toujours par déborder sur une 2e page, où atterrissent les totaux et les
 * signatures — c'est-à-dire l'essentiel. Plutôt que de deviner, le document se
 * mesure lui-même juste avant l'impression et se réduit d'un cran jusqu'à tenir.
 *
 * `zoom` est préféré à `transform: scale()` : il réduit AUSSI la hauteur de mise
 * en page, alors qu'un `scale` laisse la place d'origine réservée et continue de
 * provoquer un saut de page. Plancher à 55 % : en dessous, le document devient
 * illisible et mieux vaut une seconde page qu'une facture qu'on ne peut pas lire.
 *
 * @param marginMm marge verticale TOTALE de la règle `@page` (haut + bas).
 */
const autoFitScript = (marginMm: number) => `
    <script>
      (function () {
        // On attend le chargement COMPLET (images comprises) avant de mesurer et
        // d'imprimer. Le script s'exécutant à l'analyse du document, les photos en
        // data-URL n'étaient pas encore décodées : elles sortaient en cadres vides,
        // et la hauteur mesurée était fausse. L'ancien body onload attendait ces
        // ressources ; il fallait rétablir cette garantie.
        function run() {
        var root = document.querySelector('.invoice-box') || document.body;
        var usablePx = (297 - ${marginMm}) / 25.4 * 96;
        var scale = 1;
        // Descente par paliers de 2 % : plus fin qu'un calcul direct, car
        // réduire le zoom fait aussi retomber des lignes qui bouclaient.
        for (var i = 0; i < 24; i++) {
          if (root.getBoundingClientRect().height <= usablePx) break;
          scale -= 0.02;
          if (scale < 0.55) { scale = 0.55; document.body.style.zoom = scale; break; }
          document.body.style.zoom = scale;
        }
        window.print();
        }
        if (document.readyState === 'complete') run();
        else window.addEventListener('load', run);
      })();
    <\/script>`;

/** Pastille de couleur affichée à côté d'un nom de teinte.
 *
 *  Déclarée AU NIVEAU MODULE : définie à l'intérieur du composant, elle était
 *  recréée à chaque rendu, donc vue par React comme un type de composant
 *  différent à chaque fois. React démontait puis remontait le nœud, ce qui
 *  finissait par lever « insertBefore … is not a child of this node » et figeait
 *  l'écran. Un composant ne doit jamais être défini dans le corps d'un autre. */
/** Vignette carrée collée à un libellé, dans les documents imprimés.
 *  Renvoie une chaîne vide si l'image manque : aucun cadre vide sur le papier. */
const inlineThumbHtml = (src: string | undefined | null, size = 18) => {
  if (!src) return '';
  const safe = String(src).replace(/"/g, '&quot;');
  return `<img src="${safe}" alt="" style="height:${size}px;width:${size}px;object-fit:cover;border-radius:3px;border:0.5px solid #d7dce3;vertical-align:middle;margin-right:5px;" />`;
};

const ColorDot = ({ hex }: { hex?: string }) => (
  <span
    className="inline-block w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/20 shrink-0"
    style={hex ? { backgroundColor: hex } : undefined}
    aria-hidden="true"
  />
);

/** Total d'une grille couleur × taille. */
const sumGrid = (grid: Record<string, Record<string, number>> | undefined): number =>
  Object.values(grid || {}).reduce(
    (sum, sizes) => sum + Object.values(sizes || {}).reduce((a, b) => a + (Number(b) || 0), 0),
    0
  );

export default function SousTraitance({ models, setModels, settings, onLoadModel, onNavigate, onCreateNewProject }: SousTraitanceProps) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'orders' | 'subcontractors' | 'stock' | 'clients'>('orders');
  const [selectedSubcontractorName, setSelectedSubcontractorName] = useState<string | null>(null);
  const [subSearchQuery, setSubSearchQuery] = useState('');
  const [subListCollapsed, setSubListCollapsed] = useState(() => {
    try { return localStorage.getItem('bera_st_list_collapsed') === '1'; } catch { return false; }
  });
  const toggleSubListCollapsed = useCallback(() => {
    setSubListCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('bera_st_list_collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);
  const [modelInfoTarget, setModelInfoTarget] = useState<ModelData | null>(null);
  /** Commande d'où l'on a ouvert la fiche modèle — permet de rebondir vers sa
   *  Fiche de Commande Sous-traitance sans redemander à l'utilisateur laquelle. */
  const [modelInfoOrderId, setModelInfoOrderId] = useState<string | null>(null);

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
  const [magasinData, setMagasinData] = useState<MagasinItem[]>([]);
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
  const [isEditModelPickerOpen, setIsEditModelPickerOpen] = useState(false);
  const [isSubPickerOpen, setIsSubPickerOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SubcontractOrder | null>(null);
  const [orderPendingDelete, setOrderPendingDelete] = useState<SubcontractOrder | null>(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);
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

  /** Mode de sous-traitance CHOISI explicitement par l'utilisateur (A6).
   *  Les champs `*Fournisseur` restent alimentés pour l'API, mais c'est ce
   *  champ qui pilote le coût de revient et l'affichage des matières. */
  const [formStMode, setFormStMode] = useState<StMode>('facon');
  /** A : parcours de coupe de la commande. Défaut = comportement historique. */
  const [formCoupeLocation, setFormCoupeLocation] = useState<CoupeLocation>('SUBCONTRACTOR');
  const [formPrestationType, setFormPrestationType] = useState<'CMT' | 'FACON_PURE'>('CMT');
  const [formTissuFournisseur, setFormTissuFournisseur] = useState<'CLIENT' | 'SUBCONTRACTOR'>('CLIENT');
  const [formFournituresFournisseur, setFormFournituresFournisseur] = useState<'CLIENT' | 'SUBCONTRACTOR'>('CLIENT');
  const [formConditionnementFournisseur, setFormConditionnementFournisseur] = useState<'CLIENT' | 'SUBCONTRACTOR'>('CLIENT');
  const [formProtoRequired, setFormProtoRequired] = useState<number>(1);
  const [formProtoStatus, setFormProtoStatus] = useState<'PENDING' | 'APPROVED'>('PENDING');
  const [formPaymentTerms, setFormPaymentTerms] = useState<'AVANCE_RECEPTION' | 'APRES_LIVRAISON' | 'ECHEANCES'>('AVANCE_RECEPTION');
  const [formDefectRateAccepted, setFormDefectRateAccepted] = useState<number>(1.5);
  const [formStitchingDetails, setFormStitchingDetails] = useState<string>('');
  /** Mode Façon uniquement : fournisseur choisi par matière (clé = nom de la matière),
   *  surcharge le fournisseur du Magasin quand renseigné. */
  const [formMaterialsFournisseur, setFormMaterialsFournisseur] = useState<Record<string, string>>({});
  
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
  /** Prix unitaire de vente : VIDE tant qu'aucune valeur fiable n'existe.
   *  Jamais de valeur devinée — le champ est `required`, l'utilisateur tranche. */
  const [salePrice, setSalePrice] = useState<number | ''>('');
  const [saleTvaRate, setSaleTvaRate] = useState<number>(20);
  const [saleNotes, setSaleNotes] = useState('');
  const [saleStatus, setSaleStatus] = useState<'BROUILLON' | 'PAYEE' | 'ENVOYEE'>('BROUILLON');
  const [saleInvoiceNumber, setSaleInvoiceNumber] = useState('');
  /** Numérotation de facture : elle vient du serveur, jamais d'un tirage aléatoire. */
  const [saleNumberLoading, setSaleNumberLoading] = useState(false);
  const [saleNumberError, setSaleNumberError] = useState<string | null>(null);
  /** Jalons libres de la fiche ouverte — synchronisés depuis detailOrder à
   *  l'ouverture, puis modifiés localement + PUT optimiste (même patron que
   *  requestToggleMilestone pour les 4 jalons fixes). */
  const [customMilestones, setCustomMilestones] = useState<CustomMilestone[]>([]);
  const [newMilestoneLabel, setNewMilestoneLabel] = useState('');
  const [milestoneSaving, setMilestoneSaving] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  /** Entrées en stock d'une commande : lignes datées (couleur × taille × qualité).
   *  Les compteurs qtyAccepted/qtyToRepair/qtyRejected de la commande sont la
   *  SOMME de ces lignes, recalculée par le serveur à chaque écriture — d'où un
   *  historique corrigeable, là où un total saisi à la main ne l'était pas. */
  interface StockEntry {
    id: string;
    order_id: string;
    couleur: string | null;
    taille: string | null;
    quantite: number;
    qualite: 'ACCEPTED' | 'REPAIR' | 'REJECTED';
    note: string | null;
    date_entree: string | null;
  }

  /** Entrées de la commande ouverte dans la fiche — alimente « Reçu vs commandé ». */
  const [detailEntries, setDetailEntries] = useState<StockEntry[]>([]);
  const [stockEntryOrder, setStockEntryOrder] = useState<SubcontractOrder | null>(null);
  /** Clôture d'une commande depuis l'écran des entrées : le modèle est
   *  entièrement rentré en stock et le travail du sous-traitant est fini.
   *  On profite du moment pour recueillir l'évaluation : c'est là qu'on sait
   *  enfin si la livraison a été conforme, et une note posée à froid des mois
   *  plus tard ne vaut rien. */
  const [finishForm, setFinishForm] = useState<{ order: SubcontractOrder; rating: number } | null>(null);
  const [finishSaving, setFinishSaving] = useState(false);

  const confirmFinishOrder = async () => {
    if (!finishForm) return;
    const { order, rating } = finishForm;
    setFinishSaving(true);
    try {
      const patch = { status: 'COMPLETED' as const, subcontractorRating: rating };
      const res = await fetch(`/api/subcontract/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, ...patch } : o)));
      setDetailOrder(prev => (prev && prev.id === order.id ? { ...prev, ...patch } : prev));
      setStockEntryOrder(prev => (prev && prev.id === order.id ? { ...prev, ...patch } : prev));
      setFinishForm(null);
      setStockEntryOrder(null);
    } catch {
      setStockEntryError(tx(lang,{fr:'La clôture a échoué.',ar:'فشل الإغلاق.',en:'Closing failed.',es:'El cierre falló.',pt:'O encerramento falhou.',tr:'Kapatma başarısız.'}));
    } finally {
      setFinishSaving(false);
    }
  };

  const [stockEntries, setStockEntries] = useState<StockEntry[]>([]);
  const [stockEntriesLoading, setStockEntriesLoading] = useState(false);
  const [stockEntrySaving, setStockEntrySaving] = useState(false);
  const [stockEntryError, setStockEntryError] = useState<string | null>(null);
  /** Grille en cours de saisie : `${couleur}|${taille}` -> quantité. */
  const [entryGrid, setEntryGrid] = useState<Record<string, number | ''>>({});
  const [entryQualite, setEntryQualite] = useState<'ACCEPTED' | 'REPAIR' | 'REJECTED'>('ACCEPTED');
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const gridKey = (couleur: string, taille: string) => `${couleur}|${taille}`;

  /** Teinte enregistrée pour ce nom de couleur, ou undefined si le modèle ne
   *  porte pas de code hex : on n'invente aucune couleur. */
  /** Photo de la matière, reprise de sa fiche Magasin : reconnaître un tissu à
   *  l'œil est plus rapide que lire sa désignation. */
  const materialPhotoOf = (name: string) => {
    const n = (v: any) => String(v ?? '').trim().toLowerCase();
    const item = magasinData.find((m: any) => n(m.nom || m.designation) === n(name));
    return (item as any)?.photo || (item as any)?.image || '';
  };

  const colorHexOf = (name: string) => models
    .flatMap(m => ((m.ficheData as any)?.colors || []) as Array<{ id: string; name: string }>)
    .find(c => c.name === name && typeof c.id === 'string' && c.id.startsWith('#'))?.id;


  const loadStockEntries = async (orderId: string) => {
    setStockEntriesLoading(true);
    try {
      const res = await fetch(`/api/subcontract/stock-entries?orderId=${encodeURIComponent(orderId)}`, { credentials: 'include' });
      const list: StockEntry[] = res.ok ? await res.json() : [];
      setStockEntries(list);
      return list;
    } catch {
      setStockEntries([]);
      return [] as StockEntry[];
    } finally {
      setStockEntriesLoading(false);
    }
  };

  const openStockEntries = (order: SubcontractOrder) => {
    setStockEntryOrder(order);
    setStockEntryError(null);
    setEntryGrid({});
    setEntryQualite('ACCEPTED');
    setEntryDate(new Date().toISOString().split('T')[0]);
    loadStockEntries(order.id);
  };

  /** Applique les totaux renvoyés par le serveur — lui seul fait foi, puisque
   *  c'est lui qui les recalcule depuis les lignes. */
  const applyOrderTotals = (orderId: string, totals: any) => {
    if (!totals) return;
    const patch = {
      qtyAccepted: Number(totals.qtyAccepted) || 0,
      qtyToRepair: Number(totals.qtyToRepair) || 0,
      qtyRejected: Number(totals.qtyRejected) || 0,
    };
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, ...patch } : o)));
    setDetailOrder(prev => (prev && prev.id === orderId ? { ...prev, ...patch } : prev));
    setStockEntryOrder(prev => (prev && prev.id === orderId ? { ...prev, ...patch } : prev));
  };

  const addStockEntry = async () => {
    if (!stockEntryOrder) return;
    const lignes = Object.entries(entryGrid)
      .map(([k, v]) => {
        const [couleur, taille] = k.split('|');
        return { couleur, taille, quantite: Number(v) || 0 };
      })
      .filter(l => l.quantite > 0);

    if (lignes.length === 0) {
      setStockEntryError(tx(lang,{fr:'Saisissez au moins une quantité dans la grille.',ar:'دخّل على الأقل كمية وحدة فالجدول.',en:'Enter at least one quantity in the grid.',es:'Introduzca al menos una cantidad en la rejilla.',pt:'Introduza pelo menos uma quantidade na grelha.',tr:'Izgaraya en az bir miktar girin.'}));
      return;
    }

    setStockEntrySaving(true);
    setStockEntryError(null);
    try {
      const res = await fetch('/api/subcontract/stock-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          order_id: stockEntryOrder.id,
          lignes,
          qualite: entryQualite,
          date_entree: entryDate,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || tx(lang,{fr:"L'entree a ete refusee.",ar:'تم رفض الإدخال.',en:'The entry was rejected.',es:'La entrada fue rechazada.',pt:'A entrada foi recusada.',tr:'Giris reddedildi.'}));
      applyOrderTotals(stockEntryOrder.id, body.totals);
      setEntryGrid({});
      const fresh = await loadStockEntries(stockEntryOrder.id);
      setDetailEntries(fresh);
    } catch (err: any) {
      setStockEntryError(err.message);
    } finally {
      setStockEntrySaving(false);
    }
  };

  /** Lot en attente de confirmation : une entrée en stock est une écriture
   *  comptable de production, elle ne disparaît pas sur un clic. */
  const [batchPendingDelete, setBatchPendingDelete] = useState<{ id: string; total: number; date: string } | null>(null);

  /** Supprime une saisie entière (le lot), pas une cellule : c'est le geste que
   *  l'utilisateur a fait, donc celui qu'il doit pouvoir défaire. */
  const removeStockBatch = async (batchId: string) => {
    if (!stockEntryOrder) return;
    setStockEntrySaving(true);
    setStockEntryError(null);
    try {
      const res = await fetch(`/api/subcontract/stock-entries/batch/${batchId}`, { method: 'DELETE', credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || tx(lang,{fr:'La suppression a echoue.',ar:'فشل الحذف.',en:'Deletion failed.',es:'Error al eliminar.',pt:'Falha ao eliminar.',tr:'Silme basarisiz.'}));
      applyOrderTotals(stockEntryOrder.id, body.totals);
      const fresh = await loadStockEntries(stockEntryOrder.id);
      setDetailEntries(fresh);
    } catch (err: any) {
      setStockEntryError(err.message);
    } finally {
      setStockEntrySaving(false);
    }
  };

  /** Grille commandée du modèle, sous forme couleur × taille, et ce qui a déjà
   *  été entré : c'est la comparaison des deux qui dit ce qu'il reste à recevoir. */
  const stockEntryMatrix = useMemo(() => {
    if (!stockEntryOrder) return null;
    const fiche: any = models.find(m => m.id === stockEntryOrder.modelId)?.ficheData || {};
    const colors: Array<{ id: string; name: string }> = fiche.colors || [];
    const sizes: string[] = fiche.sizes || [];
    const gq: Record<string, number> = fiche.gridQuantities || {};

    const commande: Record<string, number> = {};
    colors.forEach(c => sizes.forEach((sz, i) => {
      const q = Number(gq[`${c.id}_${i}`]) || 0;
      if (q > 0) commande[gridKey(c.name, sz)] = q;
    }));

    const entre: Record<string, number> = {};
    stockEntries.forEach(en => {
      const k = gridKey(en.couleur || '', en.taille || '');
      entre[k] = (entre[k] || 0) + (Number(en.quantite) || 0);
    });

    return { colors, sizes, commande, entre };
  }, [stockEntryOrder, models, stockEntries]);

  /** Regroupe l'historique par saisie (batch) pour le réafficher en tableaux. */
  const stockEntryBatches = useMemo(() => {
    const map = new Map<string, { id: string; date: string; qualite: string; lignes: StockEntry[]; total: number }>();
    stockEntries.forEach(en => {
      // Les entrées d'avant le regroupement n'ont pas de lot : chacune forme le sien.
      const key = (en as any).batch_id || en.id;
      const cur = map.get(key) || { id: key, date: en.date_entree || '', qualite: en.qualite, lignes: [], total: 0 };
      cur.lignes.push(en);
      cur.total += Number(en.quantite) || 0;
      map.set(key, cur);
    });
    return [...map.values()];
  }, [stockEntries]);

  /** Jalon LIBRE en attente de confirmation : bascule ou suppression. Même
   *  exigence que les 4 jalons fixes — une checklist se coche volontairement. */
  const [customConfirm, setCustomConfirm] = useState<{
    order: SubcontractOrder;
    id: string;
    label: string;
    action: 'toggle' | 'remove';
    done: boolean;
  } | null>(null);
  /** Jalon en attente de confirmation (voir requestToggleMilestone). */
  const [milestoneConfirm, setMilestoneConfirm] = useState<{
    order: SubcontractOrder;
    field: 'tissuStatus' | 'fournituresStatus' | 'ficheTechniqueSent' | 'protoStatus';
    isOn: boolean;
  } | null>(null);
  /** Alignement de la grille du modèle sur celle de la commande (action manuelle). */
  const [gridAligning, setGridAligning] = useState(false);
  const [gridAlignError, setGridAlignError] = useState<string | null>(null);
  /** Jalon libre en cours de renommage — id du chip + valeur éditée localement. */
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [editingMilestoneLabel, setEditingMilestoneLabel] = useState('');

  // ---- B : frais additionnels de la commande consultée --------------------
  /** Chargés à l'ouverture de la fiche de détail UNIQUEMENT (pas au montage du
   *  composant) : sinon on ferait une requête par commande listée. */
  const [orderExpenses, setOrderExpenses] = useState<SubcontractExpense[]>([]);
  const [expensesOrderId, setExpensesOrderId] = useState<string | null>(null);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expensesError, setExpensesError] = useState<string | null>(null);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseLabel, setExpenseLabel] = useState('');
  /** `number | ''` : un champ vide reste vide, il ne se remplit pas d'un 0 fantôme. */
  const [expenseAmount, setExpenseAmount] = useState<number | ''>('');
  const [expenseScopeMode, setExpenseScopeMode] = useState<'ALL' | 'PARTIAL'>('ALL');
  const [expenseQuantityScope, setExpenseQuantityScope] = useState<number | ''>('');

  // ---- C : facture de sous-traitance (ce que VOUS payez au sous-traitant) ---
  const [isCostInvoiceModalOpen, setIsCostInvoiceModalOpen] = useState(false);
  const [costInvoiceOrder, setCostInvoiceOrder] = useState<SubcontractOrder | null>(null);
  const [costInvoiceQty, setCostInvoiceQty] = useState<number | ''>('');
  const [costInvoiceTva, setCostInvoiceTva] = useState<number>(20);
  /** Lignes ajoutées à la main sur la facture (transport, retouche, pénalité…). */
  const [costInvoiceExtras, setCostInvoiceExtras] = useState<{ id: string; label: string; qty: number; price: number }[]>([]);
  /** Observations libres imprimées en bas de facture (référence client, réserve…). */
  const [costInvoiceNotes, setCostInvoiceNotes] = useState('');
  /** Exonération de TVA. `null` = automatique : un modèle en marché Export part
   *  exonéré, ce qui est le cas courant chez les façonniers marocains. Un choix
   *  explicite de l'utilisateur prime toujours sur cette déduction. */
  const [costInvoiceExo, setCostInvoiceExo] = useState<boolean | null>(null);
  /** Remise commerciale : en POURCENTAGE du total HT ou en MONTANT fixe, jamais
   *  les deux — deux champs simultanés finiraient tôt ou tard cumulés par erreur
   *  et fausseraient le prix de revient. */
  const [costInvoiceDiscountMode, setCostInvoiceDiscountMode] = useState<'PCT' | 'AMOUNT'>('PCT');
  const [costInvoiceDiscount, setCostInvoiceDiscount] = useState<number | ''>('');
  /** Acompte DÉJÀ versé. Il ne diminue pas le montant de la facture (le TTC
   *  reste dû au sens comptable) : il ne réduit que le reste à payer, et part
   *  en `montant_paye` côté facturation. */
  const [costInvoiceAcompte, setCostInvoiceAcompte] = useState<number | ''>('');
  /** Dates au format ISO. Vide = valeur déduite (aujourd'hui pour la facture,
   *  conditions de paiement de la commande pour l'échéance). */
  const [costInvoiceDate, setCostInvoiceDate] = useState<string>('');
  const [costInvoiceDueDate, setCostInvoiceDueDate] = useState<string>('');
  const [costInvoiceSaving, setCostInvoiceSaving] = useState(false);
  const [costInvoiceSaveError, setCostInvoiceSaveError] = useState<string | null>(null);
  const [costInvoiceSavedNumber, setCostInvoiceSavedNumber] = useState<string | null>(null);
  /** Lignes DÉCOCHÉES de la facture (clés : 'facon', 'mat-<id>', 'exp-<id>').
   *  Par défaut tout est coché : une facture complète reste le cas normal, et
   *  exclure une ligne doit être un geste conscient. Ce qui est décoché
   *  disparaît des totaux, de l'impression ET de la facture enregistrée. */
  const [costInvoiceOff, setCostInvoiceOff] = useState<Set<string>>(new Set());
  /** Identité du bénéficiaire, pré-remplie depuis sa fiche mais CORRIGIBLE ici :
   *  un ICE fraîchement communiqué ne doit pas obliger à quitter la facture.
   *  La fiche sous-traitant reste la source, on ne la réécrit pas en douce. */
  const [costInvoiceTiers, setCostInvoiceTiers] = useState<{ nom: string; ice: string; rc: string; adresse: string; tel: string }>(
    { nom: '', ice: '', rc: '', adresse: '', tel: '' }
  );
  /** Réécritures manuelles d'une ligne : libellé et/ou montant. La ligne garde
   *  sa valeur CALCULÉE tant que rien n'est saisi — on n'écrase jamais le calcul
   *  en silence, et un bouton permet de revenir dessus. */
  const [costInvoiceEdits, setCostInvoiceEdits] = useState<Record<string, { label?: string; amount?: number; qty?: number }>>({});
  const editCostLine = (key: string, patch: { label?: string; amount?: number; qty?: number }) =>
    setCostInvoiceEdits(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const resetCostLine = (key: string) =>
    setCostInvoiceEdits(prev => { const n = { ...prev }; delete n[key]; return n; });

  /** Éléments visuels à imprimer sur la facture. */
  const [costInvoiceShow, setCostInvoiceShow] = useState<{ logo: boolean; model: boolean; subcontractor: boolean }>(
    { logo: true, model: true, subcontractor: false }
  );

  const toggleCostLine = (key: string) => setCostInvoiceOff(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  /** Remonte <InlineInvoiceList> ("Factures liées") après enregistrement pour
   *  qu'elle recharge sans dépendre d'un callback exposé par ce composant tiers. */
  const [invoiceListKey, setInvoiceListKey] = useState(0);
  /** Lecture seule : renseignée par `GET /api/permissions/company`. */
  const [companyIdentity, setCompanyIdentity] = useState<CompanyIdentity>(EMPTY_COMPANY_IDENTITY);
  /** Clients enregistrés — remontés par l'onglet Clients pour être proposés
   *  telles quelles à la sortie de stock (plus de ressaisie d'ICE / RC). */
  const [atelierClients, setAtelierClients] = useState<AtelierClient[]>([]);
  /** Entrées et sorties de TOUS les modèles : le stock vendable se lit à la
   *  maille couleur × taille (« il reste 134 pièces » ne dit pas s'il reste des
   *  XL bleus), donc l'écran a besoin du détail, pas seulement des totaux. */
  const [allStockEntries, setAllStockEntries] = useState<any[]>([]);
  const [allStockSorties, setAllStockSorties] = useState<any[]>([]);
  /** Pile des fiches ouvertes (modèle ↔ client). Une pile, et pas un simple
   *  identifiant, parce qu'on doit pouvoir descendre « modèle → client → autre
   *  modèle » puis remonter : sans elle, chaque fiche serait un cul-de-sac. */
  const [entityStack, setEntityStack] = useState<SheetTarget[]>([]);
  /** Client dont la fiche a demandé l'édition : c'est le formulaire EXISTANT de
   *  ClientsPanel qui s'ouvre, jamais un second formulaire dupliqué ici. */
  const [pendingEditClientId, setPendingEditClientId] = useState<string | null>(null);
  /** Modèle dont la grille de stock est dépliée dans l'onglet Stock & Ventes. */
  const [expandedStockModel, setExpandedStockModel] = useState<string | null>(null);
  /** Vrai dès que l'utilisateur a lui-même plié/déplié une ligne : son choix
   *  prime alors sur le dépliage automatique des listes très courtes. */
  const [stockDetailTouched, setStockDetailTouched] = useState(false);
  /** Recherche et filtre de l'onglet Stock & Ventes. Le filtre « non ventilé »
   *  existe parce que c'est exactement la population qui bloque une vente. */
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'inStock' | 'noPrice' | 'unventilated'>('all');
  /** Cartes vs tableau : le mobile impose toujours les cartes (le tableau y est
   *  illisible), ce choix ne pilote que l'écran desktop. */
  const [stockViewMode, setStockViewMode] = useState<'cards' | 'table'>('cards');
  /** Édition en ligne du prix de vente : id du modèle en cours d'édition. */
  const [editingPriceModelId, setEditingPriceModelId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<string>('');
  const [savingPriceModelId, setSavingPriceModelId] = useState<string | null>(null);

  /** Sortie de stock en préparation : un client du registre, une grille de
   *  quantités par couleur × taille, un prix. On sort des pièces PRÉCISES, pas
   *  un total abstrait — sans quoi le stock restant devient invérifiable. */
  const [sortieForm, setSortieForm] = useState<{
    model: ModelData;
    clientId: string;
    prix: number | '';
    date: string;
    grid: Record<string, number | ''>;
    /** Vrai dès que l'opérateur a touché le champ prix : le serveur PROPOSE,
     *  l'opérateur DÉCIDE — un tarif résolu ne doit jamais écraser sa saisie. */
    prixTouched: boolean;
  } | null>(null);
  const [sortieSaving, setSortieSaving] = useState(false);
  const [sortieError, setSortieError] = useState<string | null>(null);
  /** Tarif résolu par le serveur pour (modèle, client, quantité). `source` dit
   *  D'OÙ vient le prix : un montant qui apparaît sans qu'on sache pourquoi
   *  n'est pas utilisable en confiance devant un client. */
  const [sortieTarif, setSortieTarif] = useState<
    { prix: number | null; source: 'CLIENT' | 'TYPE' | 'CATALOGUE' | 'NONE'; qty_min: number | null; type_client: string | null } | null
  >(null);
  const [sortieTarifLoading, setSortieTarifLoading] = useState(false);
  /** Motif obligatoire d'une vente sous le prix plancher (politique 'CONFIRM').
   *  Il part dans la note de la sortie, préfixé, pour rester retrouvable. */
  const [sortieMotif, setSortieMotif] = useState('');
  /** Étape de confirmation « vente à perte » : le premier clic sur Enregistrer
   *  ouvre la demande de motif, le second enregistre réellement. */
  const [sortieConfirmSousCout, setSortieConfirmSousCout] = useState(false);
  /** Compteur de requêtes : chaque frappe dans la grille change la quantité et
   *  relance une résolution. Sans ce garde, une réponse lente écraserait une
   *  réponse plus récente et proposerait le tarif d'une autre quantité. */
  const sortieTarifSeq = useRef(0);

  // ── Politique commerciale : TOUJOURS lue via `?? DEFAULT_COMMERCIAL_SETTINGS`,
  //    jamais en dur — c'est tout l'intérêt d'avoir sorti ces règles du code.
  const margeMinimale: number = Number(settings?.margeMinimale ?? DEFAULT_COMMERCIAL_SETTINGS.margeMinimale);
  const venteSousCoutPolicy = (settings?.venteSousCoutPolicy ?? DEFAULT_COMMERCIAL_SETTINGS.venteSousCoutPolicy) as 'BLOCK' | 'CONFIRM' | 'ALLOW';
  const prixParClientEnabled: boolean = !!(settings?.prixParClientEnabled ?? DEFAULT_COMMERCIAL_SETTINGS.prixParClientEnabled);
  const clientTypeLabels: Record<string, string> = {
    ...DEFAULT_COMMERCIAL_SETTINGS.clientTypeLabels,
    ...(settings?.clientTypeLabels || {}),
  };

  /** Quantité totale saisie dans la grille : c'est elle qui décide du palier
   *  tarifaire, donc chaque modification relance la résolution du prix. */
  const sortieTotalQty: number = useMemo(
    () => (sortieForm ? Object.values(sortieForm.grid).reduce<number>((a, v) => a + (Number(v) || 0), 0) : 0),
    [sortieForm]
  );

  /** Prix de revient du modèle en cours de sortie, et prix plancher qui en
   *  découle. `null` = modèle sans gamme chiffrée : AUCUN garde-fou ne peut
   *  s'appliquer, et l'écran doit l'avouer plutôt que de laisser croire à un
   *  contrôle qui n'a pas eu lieu. */
  const sortieCout: number | null = useMemo(
    () => (sortieForm ? computeModelCostPrice(sortieForm.model, settings) : null),
    [sortieForm, settings]
  );
  const sortiePlancher: number | null = useMemo(
    () => prixPlancher(sortieCout, margeMinimale),
    [sortieCout, margeMinimale]
  );
  const sortieSousPlancher: boolean = sortieForm
    ? estSousPlancher(Number(sortieForm.prix) || 0, sortiePlancher)
    : false;

  const sortieModelId = sortieForm?.model.id ?? null;
  const sortieClientId = sortieForm?.clientId ?? '';

  /** Résolution du tarif (client → type de client → catalogue). Debounce parce
   *  que la quantité change à chaque frappe, et compteur de séquence + abort
   *  parce que sans eux une réponse en retard viendrait écraser la bonne. */
  useEffect(() => {
    if (!sortieModelId || IS_STATIC) { setSortieTarif(null); return; }
    const seq = ++sortieTarifSeq.current;
    const ctrl = new AbortController();
    setSortieTarifLoading(true);
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ modelId: sortieModelId, qty: String(sortieTotalQty) });
      if (sortieClientId) qs.set('clientId', sortieClientId);
      fetch(`/api/prix/resolve?${qs.toString()}`, { credentials: 'include', signal: ctrl.signal })
        .then(r => (r.ok ? r.json() : null))
        .then((d: any) => {
          if (seq !== sortieTarifSeq.current) return; // réponse périmée : on l'ignore
          if (!d) { setSortieTarif(null); return; }
          setSortieTarif({
            prix: d.prix == null ? null : Number(d.prix),
            source: (d.source || 'NONE') as 'CLIENT' | 'TYPE' | 'CATALOGUE' | 'NONE',
            qty_min: d.qty_min == null ? null : Number(d.qty_min),
            type_client: d.type_client ?? null,
          });
          // Pré-remplissage UNIQUEMENT tant que l'opérateur n'a pas saisi le
          // prix lui-même : le serveur propose, l'opérateur décide.
          if (d.prix != null) {
            setSortieForm(prev => (prev && !prev.prixTouched
              ? { ...prev, prix: Number(Number(d.prix).toFixed(2)) }
              : prev));
          }
        })
        .catch(() => { if (seq === sortieTarifSeq.current) setSortieTarif(null); })
        .finally(() => { if (seq === sortieTarifSeq.current) setSortieTarifLoading(false); });
    }, 350);
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [sortieModelId, sortieClientId, sortieTotalQty]);

  const openSortieModal = (model: ModelData, salePrice: number | null) => {
    setSortieForm({
      model,
      clientId: '',
      prix: salePrice != null && salePrice > 0 ? Number(salePrice.toFixed(2)) : '',
      date: new Date().toISOString().split('T')[0],
      grid: {},
      prixTouched: false,
    });
    setSortieError(null);
    setSortieTarif(null);
    setSortieMotif('');
    setSortieConfirmSousCout(false);
  };

  const submitSortie = async () => {
    if (!sortieForm) return;
    const lignes = Object.entries(sortieForm.grid)
      .map(([k, v]) => {
        const [couleur, taille] = k.split('|');
        return { couleur, taille, quantite: Number(v) || 0 };
      })
      .filter(l => l.quantite > 0);

    if (lignes.length === 0) {
      setSortieError(tx(lang,{fr:'Saisissez au moins une quantité.',ar:'دخّل على الأقل كمية وحدة.',en:'Enter at least one quantity.',es:'Introduzca al menos una cantidad.',pt:'Introduza pelo menos uma quantidade.',tr:'En az bir miktar girin.'}));
      return;
    }

    // Garde-fou « vente à perte ». La MÊME règle est rejouée côté serveur
    // (server/commercialPolicy.ts) : celle-ci est le confort, celle-là la loi.
    if (sortieSousPlancher) {
      if (venteSousCoutPolicy === 'BLOCK') {
        setSortieError(tx(lang,{fr:`Vente sous le prix plancher refusée par les réglages de l'entreprise.`,ar:'البيع تحت الثمن الأدنى مرفوض حسب إعدادات الشركة.',en:'Sale below the floor price is refused by the company settings.',es:'La venta por debajo del precio mínimo esta rechazada por los ajustes de la empresa.',pt:'A venda abaixo do preco minimo e recusada pelas definicoes da empresa.',tr:'Taban fiyatin altinda satis sirket ayarlarinca reddedildi.'}));
        return;
      }
      if (venteSousCoutPolicy === 'CONFIRM') {
        // Premier clic : on ouvre la demande de motif au lieu d'enregistrer.
        if (!sortieConfirmSousCout) {
          setSortieConfirmSousCout(true);
          setSortieError(null);
          return;
        }
        if (!sortieMotif.trim()) {
          setSortieError(tx(lang,{fr:'Motif obligatoire pour vendre sous le prix plancher.',ar:'السبب إجباري باش تبيع تحت الثمن الأدنى.',en:'A reason is required to sell below the floor price.',es:'Motivo obligatorio para vender por debajo del precio minimo.',pt:'Motivo obrigatorio para vender abaixo do preco minimo.',tr:'Taban fiyatin altinda satis icin gerekce zorunlu.'}));
          return;
        }
      }
    }

    // Le motif est préfixé pour rester retrouvable plus tard dans les notes
    // (`note LIKE 'VENTE_SOUS_COUT:%'`), et c'est ce préfixe que le serveur
    // cherche pour vérifier qu'une dérogation a bien été motivée.
    const note = sortieSousPlancher && venteSousCoutPolicy === 'CONFIRM' && sortieMotif.trim()
      ? `${SOUS_COUT_NOTE_PREFIX} ${sortieMotif.trim()}`
      : null;

    const client = atelierClients.find(c => c.id === sortieForm.clientId);
    setSortieSaving(true);
    setSortieError(null);
    try {
      const res = await fetch('/api/subcontract/stock-sorties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          modelId: sortieForm.model.id,
          client_id: client?.id || null,
          client_nom: client?.nom || null,
          prix_unitaire: Number(sortieForm.prix) || 0,
          date_sortie: sortieForm.date,
          note,
          lignes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || tx(lang,{fr:'La sortie a été refusée.',ar:'تم رفض الإخراج.',en:'The exit was rejected.',es:'La salida fue rechazada.',pt:'A saida foi recusada.',tr:'Cikis reddedildi.'}));
      await loadStockMovements();
      setSortieForm(null);
      setSortieMotif('');
      setSortieConfirmSousCout(false);
    } catch (err: any) {
      setSortieError(err.message);
    } finally {
      setSortieSaving(false);
    }
  };


  const loadStockMovements = async () => {
    try {
      const [e, x] = await Promise.all([
        fetch('/api/subcontract/stock-entries', { credentials: 'include' }).then(r => (r.ok ? r.json() : [])),
        fetch('/api/subcontract/stock-sorties', { credentials: 'include' }).then(r => (r.ok ? r.json() : [])),
      ]);
      setAllStockEntries(Array.isArray(e) ? e : []);
      setAllStockSorties(Array.isArray(x) ? x : []);
    } catch {
      // Hors-ligne : l'onglet retombe sur les totaux de la commande.
    }
  };

  /** Registre des clients. Les fiches en ont besoin quel que soit l'onglet
   *  ouvert : une fiche client atteinte depuis le stock ne doit pas dépendre
   *  du fait que l'onglet Clients ait été visité auparavant. */
  const loadAtelierClients = async () => {
    try {
      const res = await fetch('/api/subcontract/clients', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setAtelierClients(Array.isArray(data) ? data : []);
    } catch {
      // Hors-ligne : les sorties portent déjà le nom du client, la fiche reste lisible.
    }
  };

  /* ---- Navigation entre fiches (modèle ↔ client) ---- */
  const openEntitySheet = (target: SheetTarget) => setEntityStack([target]);
  const pushEntitySheet = (target: SheetTarget) => setEntityStack(prev => [...prev, target]);
  const backEntitySheet = () => setEntityStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
  const closeEntitySheet = () => setEntityStack([]);

  /** L'édition d'un client depuis sa fiche renvoie vers l'onglet Clients, qui
   *  détient le formulaire. On ferme la fiche pour ne pas empiler deux modales. */
  const editClientFromSheet = (client: AtelierClient) => {
    setEntityStack([]);
    setActiveTab('clients');
    setPendingEditClientId(String(client.id));
  };

  /** Stock disponible par modèle, cellule par cellule : entrées ACCEPTÉES moins
   *  sorties. C'est ce chiffre, et lui seul, qui autorise une vente. */
  const stockMatrixByModel = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    const cell = (c: any, t: any) => `${String(c ?? '')}|${String(t ?? '')}`;
    allStockEntries.forEach(en => {
      if (en.qualite !== 'ACCEPTED' || !en.modelId) return;
      const m = map.get(en.modelId) || new Map<string, number>();
      const k = cell(en.couleur, en.taille);
      m.set(k, (m.get(k) || 0) + (Number(en.quantite) || 0));
      map.set(en.modelId, m);
    });
    allStockSorties.forEach(so => {
      if (!so.modelId) return;
      const m = map.get(so.modelId) || new Map<string, number>();
      const k = cell(so.couleur, so.taille);
      m.set(k, (m.get(k) || 0) - (Number(so.quantite) || 0));
      map.set(so.modelId, m);
    });
    return map;
  }, [allStockEntries, allStockSorties]);


  // Tab 4 (Groups) States
  const { lang } = useLang();

  /** Confidentialité du coût. Un vendeur ne doit pas connaitre la marge de son
   *  patron : `canSeeCost` masque prix de revient / marge / valorisation, et
   *  `canSetPrice` verrouille l'écriture des prix de vente et des tarifs.
   *  Les sources sont celles qui existent déjà (auth + permissions), aucune
   *  nouvelle notion d'identité n'est introduite ici. */
  const { user } = useAuth();
  const perms = usePermissions();
  const commercialAccess = useMemo(() => resolveCommercialAccess({
    isOwner: perms.isSuper,
    isAdmin: user?.role === 'admin',
    // `roleId` est un UUID : la clé lisible d'un rôle, c'est son NOM.
    roleKey: perms.roleName,
    masquerCoutRevient: !!(settings?.masquerCoutRevient ?? DEFAULT_COMMERCIAL_SETTINGS.masquerCoutRevient),
    // Le champ témoin est déjà géré par les 4 couches de permissions : on le
    // relit tel quel au lieu d'ouvrir un second système parallèle.
    // On ne retient qu'un refus EXPLICITE : `canField` répond « non » pour tout
    // champ inconnu (deny par défaut), et s'appuyer dessus ferait brutalement
    // disparaître le coût chez des ateliers qui le voyaient hier.
    hiddenFields: perms.fields['model.prix_revient']?.view === false ? ['model.prix_revient'] : [],
  }), [perms, user, settings]);
  const canSeeCostHere = commercialAccess.canSeeCost;
  const canSetPriceHere = commercialAccess.canSetPrice;

  /** Devise et locale issues des réglages — plus de 'MAD' ni de 'fr-FR' en dur. */
  const currency: string = settings?.currency || 'MAD';
  const dateLocale: string = DATE_LOCALES[lang as string] || 'fr-FR';
  const fmtDate = (value?: string | null): string => {
    if (!value) return '-';
    const d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(dateLocale);
  };

  /** Chargement initial — les cinq sources sont indépendantes : l'échec de l'une
   *  ne doit pas priver l'écran des quatre autres (C2). Chaque source rapporte sa
   *  propre erreur, y compris le magasin dont l'échec était auparavant avalé en
   *  silence — ce qui faisait afficher un stock matières à zéro sans le dire. */
  const fetchData = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    const sources = [
      {
        url: '/api/subcontract',
        label: tx(lang,{fr:'commandes de sous-traitance',ar:'طلبيات المقاولة من الباطن',en:'subcontract orders',es:'pedidos de subcontratación',pt:'encomendas de subcontratação',tr:'taşeron siparişleri'}),
        apply: (d: any) => setOrders(Array.isArray(d) ? d : []),
      },
      {
        url: '/api/subcontract/groups',
        label: tx(lang,{fr:'groupes de sous-traitants',ar:'مجموعات المقاولين من الباطن',en:'subcontractor groups',es:'grupos de subcontratistas',pt:'grupos de subcontratados',tr:'taşeron grupları'}),
        apply: (d: any) => setGroups(Array.isArray(d) ? d : []),
      },
      {
        url: '/api/subcontract/profiles',
        label: tx(lang,{fr:'profils sous-traitants',ar:'ملفات المقاولين من الباطن',en:'subcontractor profiles',es:'perfiles de subcontratistas',pt:'perfis de subcontratados',tr:'taşeron profilleri'}),
        apply: (d: any) => setSubcontractorProfiles(Array.isArray(d) ? d : []),
      },
      {
        url: '/api/facturation/factures?type=VENTE',
        label: tx(lang,{fr:'factures de vente',ar:'فواتير البيع',en:'sale invoices',es:'facturas de venta',pt:'faturas de venda',tr:'satış faturaları'}),
        apply: (d: any) => setInvoices(Array.isArray(d) ? d : []),
      },
      {
        url: '/api/magasin/products',
        label: tx(lang,{fr:'stock magasin',ar:'مخزون المستودع',en:'store stock',es:'stock del almacén',pt:'stock do armazém',tr:'depo stoğu'}),
        apply: (d: any) => setMagasinData(Array.isArray(d) ? d : []),
      },
    ];

    const results = await Promise.allSettled(
      sources.map(async (s) => {
        const res = await fetch(s.url, { credentials: 'include', signal });
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
    );

    if (signal?.aborted) return;

    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        sources[i].apply(r.value);
      } else {
        if ((r.reason as any)?.name === 'AbortError') return;
        console.error(`[SousTraitance] ${sources[i].url}`, r.reason);
        failed.push(sources[i].label);
      }
    });

    if (failed.length > 0) {
      setError(
        tx(lang,{
          fr:'Sources non chargées', ar:'مصادر لم تُحمَّل', en:'Sources not loaded',
          es:'Fuentes no cargadas', pt:'Fontes não carregadas', tr:'Yüklenemeyen kaynaklar',
        }) + ' : ' + failed.join(', ')
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    // Mouvements de stock et registre clients : les fiches modèle/client les
    // agrègent entièrement côté client, elles doivent donc être présentes dès
    // l'ouverture du module et non seulement après une sortie de stock.
    loadStockMovements();
    loadAtelierClients();
    return () => controller.abort();
  }, []);

  // ======================================================================
  // B — FRAIS ADDITIONNELS LIBRES (chargés à la demande, jamais en masse)
  // ======================================================================

  /** Normalise une ligne renvoyée par l'API : les montants doivent être des
   *  nombres exploitables, une portée illisible vaut « toute la commande »
   *  plutôt qu'une quantité inventée. */
  const normalizeExpense = (raw: any): SubcontractExpense => {
    const scope = Number(raw?.quantity_scope ?? raw?.quantityScope);
    return {
      id: String(raw?.id ?? ''),
      order_id: String(raw?.order_id ?? raw?.orderId ?? ''),
      label: String(raw?.label ?? ''),
      amount: Number(raw?.amount) || 0,
      quantity_scope: Number.isFinite(scope) && scope > 0 ? scope : null,
      created_at: raw?.created_at ?? raw?.createdAt,
    };
  };

  /** Message d'erreur réseau lisible — jamais d'`alert()`, jamais un code brut. */
  const expenseErrorMessage = (status?: number): string => {
    if (status === 403) {
      return tx(lang,{fr:"Vous n'avez pas la permission de gérer les frais de cette commande.",ar:'ما عندكش الإذن لتدبير مصاريف هاد الطلبية.',en:'You do not have permission to manage this order\'s expenses.',es:'No tiene permiso para gestionar los gastos de este pedido.',pt:'Não tem permissão para gerir as despesas desta encomenda.',tr:'Bu siparişin masraflarını yönetme izniniz yok.'});
    }
    return tx(lang,{
      fr:'Frais additionnels indisponibles — le service n\'a pas répondu. Les montants affichés ci-dessous peuvent être incomplets.',
      ar:'المصاريف الإضافية غير متاحة — الخدمة ما جاوبتش. المبالغ المعروضة تحت يمكن تكون ناقصة.',
      en:'Additional expenses unavailable — the service did not respond. The amounts shown below may be incomplete.',
      es:'Gastos adicionales no disponibles — el servicio no respondió. Los importes mostrados pueden estar incompletos.',
      pt:'Despesas adicionais indisponíveis — o serviço não respondeu. Os montantes apresentados podem estar incompletos.',
      tr:'Ek masraflar kullanılamıyor — servis yanıt vermedi. Aşağıdaki tutarlar eksik olabilir.',
    });
  };

  const loadExpenses = async (orderId: string, signal?: AbortSignal) => {
    setExpensesLoading(true);
    setExpensesError(null);
    try {
      const res = await fetch(`/api/subcontract/${orderId}/expenses`, { credentials: 'include', signal });
      if (!res.ok) {
        const err: any = new Error(String(res.status));
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      if (signal?.aborted) return [];
      const list = Array.isArray(data) ? data.map(normalizeExpense) : [];
      setOrderExpenses(list);
      setExpensesOrderId(orderId);
      return list;
    } catch (err: any) {
      if (err?.name === 'AbortError') return [];
      console.error('[SousTraitance] expenses', err);
      setOrderExpenses([]);
      setExpensesOrderId(orderId);
      setExpensesError(expenseErrorMessage(err?.status));
      return [];
    } finally {
      if (!signal?.aborted) setExpensesLoading(false);
    }
  };

  /** Champs de `ficheData.soustraitance` qu'une commande peut imposer au modèle. */
  type StPatch = {
    active?: boolean;
    mode?: StMode;
    prix?: number;
    orderQty?: number;
    orderId?: string;
    frais?: { label: string; amount: number; quantityScope: number | null }[];
  };

  /** Vrai si le patch n'apporte AUCUNE valeur nouvelle. C'est le garde-fou qui
   *  empêche la synchronisation bidirectionnelle Commande ↔ Modèle de boucler :
   *  le second aller-retour ne trouve plus rien à écrire et s'arrête. */
  const stPatchIsNoop = (current: any, patch: StPatch): boolean =>
    (Object.keys(patch) as (keyof StPatch)[]).every(k => {
      if (k === 'frais') return JSON.stringify(current?.frais ?? []) === JSON.stringify(patch.frais ?? []);
      return current?.[k] === patch[k];
    });

  /** Écrit un patch partiel dans `ficheData.soustraitance` d'un modèle.
   *
   *  `POST /api/models` remplace le modèle ENTIER : envoyer la copie portée par la
   *  prop `models` écraserait ce que l'ingénierie a modifié entre-temps. On relit
   *  donc la version à jour juste avant d'écrire, et on n'y applique que ce patch.
   *  En mode statique (pas de serveur Express) la prop `models` EST la source de
   *  vérité et `setModels` déclenche la persistance.
   *
   *  N'écrit rien si le patch est un no-op : ni requête, ni re-render inutile. */
  const writeModelSoustraitance = async (modelId: string, patch: StPatch): Promise<void> => {
    if (!modelId || modelId === 'MANUAL') return;
    const local = models.find(m => m.id === modelId);
    if (!local) return;
    if (stPatchIsNoop(local.ficheData?.soustraitance, patch)) return;

    try {
      let base: ModelData = local;
      if (!IS_STATIC) {
        const fresh = await fetch('/api/models', { credentials: 'include' });
        if (!fresh.ok) return;
        const list = await fresh.json();
        const found = Array.isArray(list) ? list.find((m: ModelData) => m.id === modelId) : undefined;
        if (!found) return;
        base = found;
      }
      // Re-test sur la version fraîche : un autre poste a pu écrire la même valeur
      // entre-temps, auquel cas il n'y a plus rien à faire.
      if (stPatchIsNoop((base.ficheData as any)?.soustraitance, patch)) return;

      const updated: ModelData = {
        ...base,
        ficheData: {
          ...(base.ficheData as any),
          soustraitance: {
            // Valeurs de repli : un patch qui ne porte que des frais ne doit pas
            // produire un bloc sous-traitance incomplet.
            active: false, mode: 'facon' as StMode, prix: 0,
            ...((base.ficheData as any)?.soustraitance || {}),
            ...patch,
          },
        },
        updatedAt: new Date().toISOString(),
      };
      if (!IS_STATIC) {
        const res = await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updated),
        });
        if (!res.ok) return;
      }
      setModels?.(prev => prev.map(m => (m.id === updated.id ? updated : m)));
    } catch (err) {
      console.error('[SousTraitance] sync soustraitance → modèle', err);
    }
  };

  /** Écrit la grille couleur × taille d'une commande dans la fiche de coût du
   *  modèle. Même précaution que `writeModelSoustraitance` : on relit la version
   *  fraîche avant d'écrire pour ne pas écraser le travail de l'ingénierie, et on
   *  ne touche QUE `gridQuantities` (+ `quantity`, qui en est le total et sert de
   *  base à plusieurs calculs).
   *
   *  Jamais automatique : la grille pilote le prix de revient, donc seul un clic
   *  explicite de l'utilisateur déclenche l'alignement. */
  const writeModelGrid = async (modelId: string, gridQuantities: Record<string, number>): Promise<boolean> => {
    if (!modelId || modelId === 'MANUAL') return false;
    const local = models.find(m => m.id === modelId);
    if (!local) return false;

    try {
      let base: ModelData = local;
      if (!IS_STATIC) {
        const fresh = await fetch('/api/models', { credentials: 'include' });
        if (!fresh.ok) return false;
        const list = await fresh.json();
        const found = Array.isArray(list) ? list.find((m: ModelData) => m.id === modelId) : undefined;
        if (!found) return false;
        base = found;
      }

      const total = Object.values(gridQuantities).reduce((a, v) => a + (Number(v) || 0), 0);
      const updated: ModelData = {
        ...base,
        ficheData: {
          ...(base.ficheData as any),
          gridQuantities,
          ...(total > 0 ? { quantity: total } : {}),
        },
        updatedAt: new Date().toISOString(),
      };

      if (!IS_STATIC) {
        const res = await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updated),
        });
        if (!res.ok) return false;
      }
      setModels?.(prev => prev.map(m => (m.id === updated.id ? updated : m)));
      return true;
    } catch (err) {
      console.error('[SousTraitance] sync grille → modèle', err);
      return false;
    }
  };

  /** Écrit le prix de VENTE (`ficheData.clientPrice`) depuis l'onglet Stock.
   *
   *  Même précaution que `writeModelGrid` — `POST /api/models` remplace le modèle
   *  entier, donc on relit la version fraîche avant d'écrire. On ne touche QU'AU
   *  prix de vente : aucune formule de coût n'est recalculée ici, le prix de
   *  revient reste celui de la fiche. */
  const writeModelClientPrice = async (modelId: string, clientPrice: number): Promise<boolean> => {
    if (!modelId || modelId === 'MANUAL') return false;
    const local = models.find(m => m.id === modelId);
    if (!local) return false;

    try {
      let base: ModelData = local;
      if (!IS_STATIC) {
        const fresh = await fetch('/api/models', { credentials: 'include' });
        if (!fresh.ok) return false;
        const list = await fresh.json();
        const found = Array.isArray(list) ? list.find((m: ModelData) => m.id === modelId) : undefined;
        if (!found) return false;
        base = found;
      }

      const updated: ModelData = {
        ...base,
        ficheData: { ...(base.ficheData as any), clientPrice },
        updatedAt: new Date().toISOString(),
      };

      if (!IS_STATIC) {
        const res = await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updated),
        });
        if (!res.ok) return false;
      }
      setModels?.(prev => prev.map(m => (m.id === updated.id ? updated : m)));
      return true;
    } catch (err) {
      console.error('[SousTraitance] sync prix de vente → modèle', err);
      return false;
    }
  };

  /** Valide l'édition en ligne du prix de vente (Entrée ou perte de focus). */
  const commitInlinePrice = async (modelId: string) => {
    const raw = editingPriceValue.trim();
    const parsed = raw === '' ? 0 : Number(raw.replace(',', '.'));
    setEditingPriceModelId(null);
    if (!isFinite(parsed) || parsed < 0) return;
    const current = Number((models.find(m => m.id === modelId)?.ficheData as any)?.clientPrice) || 0;
    if (Math.abs(current - parsed) < 0.0001) return;
    setSavingPriceModelId(modelId);
    await writeModelClientPrice(modelId, parsed);
    setSavingPriceModelId(null);
  };

  /** Répercute les frais additionnels d'une commande sur la fiche de coût du
   *  modèle, en conservant la PORTÉE de chaque frais (`quantity_scope`) : la fiche
   *  de coût doit pouvoir distinguer un frais qui pèse sur toute la commande d'un
   *  frais qui ne pèse que sur une partie des pièces. */
  const syncExpensesToModel = async (order: SubcontractOrder, expenses: SubcontractExpense[]) => {
    await writeModelSoustraitance(order.modelId, {
      frais: expenses.map(e => ({
        label: e.label,
        amount: Number(e.amount) || 0,
        quantityScope: e.quantity_scope && e.quantity_scope > 0 ? e.quantity_scope : null,
      })),
      orderQty: Number(order.totalQuantity) || 0,
      orderId: order.id,
    });
  };

  /** Réconciliation des FRAIS. Il n'existe pas d'endpoint global : les frais ne se
   *  lisent que commande par commande, donc sans ce passage un frais saisi avant
   *  l'existence du lien (ou depuis un autre poste) n'atteindrait jamais la fiche
   *  de coût — le modèle afficherait un prix de revient trop bas.
   *
   *  Une requête par commande liée, une seule fois par lot de commandes : le `ref`
   *  garde la signature déjà traitée pour que les re-rendus (dont ceux provoqués
   *  par nos propres écritures) ne relancent pas les lectures. */
  const reconciledExpensesRef = useRef<string>('');
  useEffect(() => {
    if (loading || orders.length === 0 || models.length === 0) return;

    const linked = orders.filter(o => o.modelId && o.modelId !== 'MANUAL' && models.some(m => m.id === o.modelId));
    if (linked.length === 0) return;

    const signature = linked.map(o => o.id).sort().join('|');
    if (reconciledExpensesRef.current === signature) return;
    reconciledExpensesRef.current = signature;

    let cancelled = false;
    (async () => {
      for (const order of linked) {
        if (cancelled) return;
        try {
          const res = await fetch(`/api/subcontract/${order.id}/expenses`, { credentials: 'include' });
          if (!res.ok) continue;
          const rows = await res.json();
          if (cancelled) return;
          await syncExpensesToModel(order, (Array.isArray(rows) ? rows : []).map(normalizeExpense));
        } catch (err) {
          console.error('[SousTraitance] réconciliation frais', order.id, err);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [orders, models.length, loading]);

  /** Les frais ne sont chargés qu'à l'ouverture d'une fiche, et rechargés
   *  seulement si la commande consultée change. */
  useEffect(() => {
    if (!isDetailModalOpen || !detailOrder) return;
    const controller = new AbortController();
    loadExpenses(detailOrder.id, controller.signal);
    setExpenseLabel('');
    setExpenseAmount('');
    setExpenseScopeMode('ALL');
    setExpenseQuantityScope('');
    // Le tableau « Reçu vs commandé » a besoin du détail des entrées, pas
    // seulement des totaux portés par la commande.
    fetch(`/api/subcontract/stock-entries?orderId=${encodeURIComponent(detailOrder.id)}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : []))
      .then(d => setDetailEntries(Array.isArray(d) ? d : []))
      .catch(() => setDetailEntries([]));
    setCustomMilestones(readCustomMilestones(detailOrder));
    setNewMilestoneLabel('');
    // Une erreur de jalon appartient à la fiche où elle s'est produite : elle ne
    // doit pas accueillir la commande suivante.
    setMilestoneError(null);
    setGridAlignError(null);
    return () => controller.abort();
  }, [isDetailModalOpen, detailOrder?.id]);

  const handleAddExpense = async (order: SubcontractOrder) => {
    const label = expenseLabel.trim();
    const amount = Number(expenseAmount);
    if (!label) {
      setExpensesError(tx(lang,{fr:'Indiquez un libellé pour le frais.',ar:'حدّد تسمية للمصروف.',en:'Enter a label for the expense.',es:'Indique una etiqueta para el gasto.',pt:'Indique um rótulo para a despesa.',tr:'Masraf için bir etiket girin.'}));
      return;
    }
    if (!(amount > 0)) {
      setExpensesError(tx(lang,{fr:'Le montant doit être supérieur à 0.',ar:'المبلغ خاصو يكون أكبر من 0.',en:'The amount must be greater than 0.',es:'El importe debe ser mayor que 0.',pt:'O montante deve ser superior a 0.',tr:'Tutar 0’dan büyük olmalıdır.'}));
      return;
    }
    let quantityScope: number | null = null;
    if (expenseScopeMode === 'PARTIAL') {
      const q = Number(expenseQuantityScope);
      if (!(q > 0) || q > order.totalQuantity) {
        setExpensesError(tx(lang,{
          fr:`La quantité partielle doit être comprise entre 1 et ${order.totalQuantity}.`,
          ar:`الكمية الجزئية خاصها تكون بين 1 و ${order.totalQuantity}.`,
          en:`The partial quantity must be between 1 and ${order.totalQuantity}.`,
          es:`La cantidad parcial debe estar entre 1 y ${order.totalQuantity}.`,
          pt:`A quantidade parcial deve estar entre 1 e ${order.totalQuantity}.`,
          tr:`Kısmi miktar 1 ile ${order.totalQuantity} arasında olmalıdır.`,
        }));
        return;
      }
      quantityScope = q;
    }

    setExpenseSaving(true);
    setExpensesError(null);
    try {
      const res = await fetch(`/api/subcontract/${order.id}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label, amount, quantityScope }),
      });
      if (!res.ok) {
        const err: any = new Error(String(res.status));
        err.status = res.status;
        throw err;
      }
      setExpenseLabel('');
      setExpenseAmount('');
      setExpenseScopeMode('ALL');
      setExpenseQuantityScope('');
      await syncExpensesToModel(order, await loadExpenses(order.id));
    } catch (err: any) {
      console.error('[SousTraitance] add expense', err);
      setExpensesError(expenseErrorMessage(err?.status));
    } finally {
      setExpenseSaving(false);
    }
  };

  const handleDeleteExpense = async (order: SubcontractOrder, expenseId: string) => {
    setExpenseSaving(true);
    setExpensesError(null);
    try {
      const res = await fetch(`/api/subcontract/expenses/${expenseId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const err: any = new Error(String(res.status));
        err.status = res.status;
        throw err;
      }
      await syncExpensesToModel(order, await loadExpenses(order.id));
    } catch (err: any) {
      console.error('[SousTraitance] delete expense', err);
      setExpensesError(expenseErrorMessage(err?.status));
    } finally {
      setExpenseSaving(false);
    }
  };

  // ======================================================================
  // C — FACTURE DE SOUS-TRAITANCE (ce que VOUS payez au sous-traitant)
  // ======================================================================

  /** Part d'un frais imputable à une quantité facturée.
   *  Règle unique : `montant × min(qtéFacturée, portée) / portée`, où la portée
   *  vaut `quantity_scope` s'il existe, sinon la quantité totale de la commande.
   *  - Un frais « toute la commande » facturé en entier est repris tel quel.
   *  - Un frais à portée partielle est repris EN ENTIER dès que la quantité
   *    facturée couvre sa portée, et au prorata sinon.
   *  La somme des factures partielles successives retombe exactement sur le
   *  montant saisi : ni double comptage, ni perte. */
  const expenseShare = (expense: SubcontractExpense, billedQty: number, orderTotal: number): number => {
    const scope = expense.quantity_scope && expense.quantity_scope > 0 ? expense.quantity_scope : orderTotal;
    if (!(scope > 0)) return expense.amount;
    const covered = Math.min(Math.max(0, billedQty), scope);
    return (expense.amount * covered) / scope;
  };

  const openCostInvoiceModal = (order: SubcontractOrder) => {
    setCostInvoiceOrder(order);
    // Le sous-traitant livre rarement au chiffre exact : c'est ce qui a été REÇU
    // et accepté qui se facture, pas ce qui avait été commandé. À défaut de
    // réception saisie, on retombe sur la quantité commandée.
    const recu = Number(order.qtyAccepted) || 0;
    setCostInvoiceQty(recu > 0 ? recu : (order.totalQuantity > 0 ? order.totalQuantity : ''));
    setCostInvoiceTva(20);
    setCostInvoiceSaveError(null);
    setCostInvoiceSavedNumber(null);
    setCostInvoiceOff(new Set());
    setCostInvoiceEdits({});
    setCostInvoiceExtras([]);
    setCostInvoiceNotes('');
    {
      const prof = subcontractorProfiles.find(p => p.name === order.subcontractorName);
      setCostInvoiceTiers({
        nom: order.subcontractorName || '',
        ice: prof?.ice || '',
        rc: prof?.rc || '',
        adresse: prof?.address || '',
        tel: prof?.phone || order.subcontractorPhone || '',
      });
    }
    setCostInvoiceShow({ logo: true, model: true, subcontractor: false });
    setIsCostInvoiceModalOpen(true);
    // Filet de sécurité : si la fiche n'a pas (ou plus) chargé les frais de
    // CETTE commande, on les demande avant d'afficher un total incomplet.
    if (expensesOrderId !== order.id) loadExpenses(order.id);
    loadCompanyIdentity();
    // Le registre doit être disponible dès la sortie de stock, même si l'onglet
    // Clients n'a jamais été ouvert dans cette session.
    loadStockMovements();
    fetch('/api/subcontract/clients', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : []))
      .then(d => setAtelierClients(Array.isArray(d) ? d : []))
      .catch(() => { /* hors-ligne : la saisie libre reste possible */ });
  };

  /** LECTURE SEULE de l'identité légale de l'entreprise. Aucune édition ici :
   *  elle se fait dans Admin > Entreprise. Un échec ou un profil incomplet
   *  n'empêche JAMAIS d'établir la facture — l'en-tête se contente d'être
   *  moins complet, et la modale le signale. */
  const loadCompanyIdentity = async () => {
    try {
      const res = await fetch('/api/permissions/company', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      const meta = (data?.profileMeta && typeof data.profileMeta === 'object') ? data.profileMeta : {};
      const ville = String(meta.ville ?? '').trim();
      const adresse = String(meta.adresse ?? '').trim();
      const identity = {
        nom: String(meta.raisonSociale ?? '').trim() || String(data?.name ?? '').trim(),
        ice: String(meta.ice ?? '').trim(),
        rc: String(meta.rc ?? '').trim(),
        adresse: [adresse, ville].filter(Boolean).join(', '),
        tel: String(meta.companyPhone ?? meta.adminPhone ?? '').trim(),
        logo: typeof data?.logo === 'string' ? data.logo : '',
      };
      setCompanyIdentity(identity);
      return identity;
    } catch (err) {
      console.error('[SousTraitance] company identity', err);
      return null;
    }
  };

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

  /** Matières à prévoir pour une commande en mode Façon (le sous-traitant coud,
   *  le client fournit la matière). Même formule que le tableau « Détail des
   *  Achats » de Coûts & Budget (majoration 5%), pour rester cohérent avec le
   *  reste de l'appli : besoin = qté/pièce du modèle × quantité de la commande. */
  const getFaconMaterialsNeeds = (
    order: { modelId: string; totalQuantity: number } | null,
    fournisseurOverride: Record<string, string> = {}
  ) => {
    if (!order) return [];
    const model = models.find(m => m.id === order.modelId);
    const materials = model?.ficheData?.materials || [];
    if (!materials.length) return [];
    const WASTE_RATE = 5;
    return materials.map(m => {
      const baseQty = m.qty * order.totalQuantity;
      const withWaste = baseQty * (1 + WASTE_RATE / 100);
      const buyQty = (m.unit === 'bobine' || m.unit === 'pc') ? Math.ceil(withWaste) : parseFloat(withWaste.toFixed(2));
      const st = resolveStock(m, magasinData, buyQty);
      const overrideFournisseur = fournisseurOverride[m.name];
      const fournisseur = overrideFournisseur || st.fournisseur;
      // Ordre de fiabilité du prix : CUMP (coût réel constaté en magasin) > prix
      // catalogue magasin > prix saisi manuellement dans la fiche de coût du
      // modèle. On ne descend au prix manuel que si l'article n'est pas au stock.
      const stockCump = Number(st.item?.cump) || 0;
      const stockPrix = Number(st.item?.prixUnitaire) || 0;
      const unitPrice = stockCump > 0 ? stockCump : stockPrix > 0 ? stockPrix : m.unitPrice;
      const priceSource: 'stock' | 'manuel' = (stockCump > 0 || stockPrix > 0) ? 'stock' : 'manuel';
      return {
        id: m.id,
        name: m.name,
        unit: m.unit,
        unitPrice,
        priceSource,
        buyQty,
        stockActuel: st.stockActuel,
        manque: st.manque,
        fournisseur,
        delaiLivraison: st.delaiLivraison,
        cost: buyQty * unitPrice,
        isOverridden: !!overrideFournisseur,
      };
    });
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

  /** Total DÉRIVÉ de la grille (C1). Il n'est plus poussé depuis un updater
   *  `setBatches` — appeler `setFormTotalQuantity` à l'intérieur d'un updater
   *  provoquait une double application en StrictMode / React 19. */
  const gridTotal = useMemo(() => sumGrid(batches[0]?.grid), [batches]);
  const hasGrid = useMemo(() => Object.keys(batches[0]?.grid || {}).length > 0, [batches]);
  /** Quantité qui fait foi : la grille dès qu'elle existe, sinon la saisie manuelle. */
  const effectiveTotalQuantity = hasGrid ? gridTotal : formTotalQuantity;

  /** Mise à jour immuable du premier lot — aucune mutation en place des objets
   *  `grid[color]`, qui empêchait React de voir le changement. */
  const patchBatch = (patch: Partial<BatchInput> | ((b: BatchInput) => Partial<BatchInput>)) => {
    setBatches(prev => prev.map((b, i) => (i === 0 ? { ...b, ...(typeof patch === 'function' ? patch(b) : patch) } : b)));
  };

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
      /** Pièces physiquement SORTIES du stock (st_stock_sorties). */
      exitedQty: number;
      /** Pièces FACTURÉES (lignes de factures VENTE). Les deux notions divergent
       *  légitimement — une sortie non encore facturée, une facture d'avance —
       *  et les confondre rendait l'écart invisible donc introuvable. */
      invoicedQty: number;
      remainingStock: number;
      /** Vrai s'il existe au moins une réception détaillée couleur × taille. */
      isVentile: boolean;
      /** D'où vient `remainingStock` : du détail des mouvements, ou du repli sur
       *  les compteurs de commande (auquel cas aucune vente n'est possible). */
      stockSource: 'DETAIL' | 'FALLBACK';
      /** Prix de revient réel du modèle, ou `null` si aucune donnée fiable. */
      price: number | null;
      /** Prix de vente unitaire du modèle (fiche de coût), ou null. */
      salePrice: number | null;
      startDate: string;
      status: string;
      /** Nombre de FOIS où une sortie a été saisie (une grille couleur x taille
       *  saisie d'un coup = un seul geste, partagé par `batch_id`) — pas la
       *  quantité de pièces, le nombre de transactions. Répond à « combien de
       *  fois j'ai vendu ce modèle ? ». Tant que la vente n'a qu'un seul canal
       *  (aucune distinction client / magasin / boutique en ligne n'existe
       *  encore côté données), ce compteur reste global. */
      sortiesCount: number;
      /** Nombre de commandes de sous-traitance distinctes ayant produit ce modèle. */
      ordersCount: number;
    }> = [];

    models.forEach(model => {
      // Cet onglet est le stock de CE module : il ne doit montrer que les
      // modèles réellement passés par la sous-traitance. Lister toute la
      // bibliothèque noyait les quelques modèles concernés sous des lignes à
      // zéro qui ne sortiront jamais d'ici.
      const hasOrder = orders.some(o => o.modelId === model.id);
      if (!hasOrder) return;

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

      // 2. Quantité vendue depuis les factures VENTE.
      //    UNIQUEMENT sur `line.modelId` : l'ancien repli textuel
      //    `designation.includes(nom_modele)` faisait compter les ventes de
      //    « POLO ENFANT » dans le stock de « POLO », donc un stock fini faux.
      let sold = 0;
      invoices.forEach(inv => {
        const lignes = inv.lignes || [];
        lignes.forEach((line: any) => {
          if (line.modelId && line.modelId === model.id) {
            sold += line.qte || 0;
          }
        });
      });

      // Stock restant : le DÉTAIL des mouvements fait foi quand il existe, car
      // c'est lui qui est ventilé par couleur et par taille. Les totaux de la
      // commande ne servent que de repli pour les données antérieures.
      const entered = allStockEntries
        .filter(en => en.modelId === model.id && en.qualite === 'ACCEPTED')
        .reduce((a, en) => a + (Number(en.quantite) || 0), 0);
      const exited = allStockSorties
        .filter(so => so.modelId === model.id)
        .reduce((a, so) => a + (Number(so.quantite) || 0), 0);
      const isVentile = entered > 0 || exited > 0;
      const remaining = isVentile
        ? Math.max(0, entered - exited)
        : Math.max(0, produced - sold);
      // Le repli n'est pas un détail cosmétique : sans entrée ventilée, la grille
      // de sortie est vide et la vente est IMPOSSIBLE. L'écran doit donc l'avouer
      // au lieu d'afficher un stock vert qui ne peut pas être vendu.
      const stockSource: 'DETAIL' | 'FALLBACK' = isVentile ? 'DETAIL' : 'FALLBACK';

      // Prix de revient réel (même formule que la fiche de coût). `null` quand
      // le modèle n'a ni gamme chiffrée ni prix de sous-traitance : on n'invente
      // aucun montant, le champ de la facture restera vide et obligatoire.
      const price = computeModelCostPrice(model, settings);

      // Prix de VENTE saisi dans la fiche de coût : c'est lui qui doit être
      // proposé à la sortie, le prix de revient ne servant qu'à mesurer la marge.
      const salePrice = Number((model.ficheData as any)?.clientPrice) || null;

      // Compte les GESTES, pas les pièces : une grille couleur x taille saisie
      // d'un coup partage un `batch_id`, donc c'est lui qui identifie « une
      // sortie » — sinon 12 tailles remplies en une fois compteraient pour 12.
      const sortieBatches = new Set(
        allStockSorties
          .filter(so => so.modelId === model.id)
          .map(so => (so as any).batch_id || so.id)
      );
      const ordersCount = orders.filter(o => o.modelId === model.id).length;

      list.push({
        model,
        producedQty: produced,
        soldQty: exited > 0 ? exited : sold,
        exitedQty: exited,
        invoicedQty: sold,
        remainingStock: remaining,
        isVentile,
        stockSource,
        price,
        salePrice,
        startDate: oldestDate ? fmtDate(oldestDate) : tx(lang,{fr:'Non commencée',ar:'لم تبدأ',en:'Not started',es:'No iniciado',pt:'Não iniciado',tr:'Başlamadı'}),
        status: activeStatus,
        sortiesCount: sortieBatches.size,
        ordersCount,
      });
    });

    return list;
  }, [models, orders, invoices, settings, lang, dateLocale, allStockEntries, allStockSorties]);

  /** Liste réellement affichée : recherche libre (modèle ou client) + un filtre
   *  par intention. « Non ventilé » isole les lignes qui bloquent une vente. */
  const filteredStockStats = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    return modelStockStats.filter(it => {
      if (q) {
        const nom = (it.model.meta_data?.nom_modele || '').toLowerCase();
        const client = (it.model.ficheData?.client || '').toLowerCase();
        if (!nom.includes(q) && !client.includes(q)) return false;
      }
      if (stockFilter === 'inStock') return it.remainingStock > 0;
      if (stockFilter === 'noPrice') return !(it.salePrice != null && it.salePrice > 0);
      if (stockFilter === 'unventilated') return it.stockSource === 'FALLBACK';
      return true;
    });
  }, [modelStockStats, stockSearch, stockFilter]);

  /** Indicateurs de tête. La valeur est calculée au prix de REVIENT (valorisation
   *  comptable du stock) et ignore les modèles sans prix fiable plutôt que de
   *  leur inventer un montant. */
  const stockKpis = useMemo(() => {
    let value = 0, available = 0, exited = 0, noPrice = 0;
    filteredStockStats.forEach(it => {
      available += it.remainingStock;
      exited += it.exitedQty;
      if (it.price != null) value += it.remainingStock * it.price;
      if (!(it.salePrice != null && it.salePrice > 0)) noPrice += 1;
    });
    return { value, available, exited, noPrice };
  }, [filteredStockStats]);

  /** Totaux du pied de tableau — un stock ne se lit pas ligne à ligne. */
  const stockTotals = useMemo(() => {
    return filteredStockStats.reduce(
      (a, it) => ({
        produced: a.produced + it.producedQty,
        exited: a.exited + it.exitedQty,
        invoiced: a.invoiced + it.invoicedQty,
        remaining: a.remaining + it.remainingStock,
        value: a.value + (it.price != null ? it.remainingStock * it.price : 0),
      }),
      { produced: 0, exited: 0, invoiced: 0, remaining: 0, value: 0 }
    );
  }, [filteredStockStats]);

  /** Dépliage : quand la liste tient en une ou deux lignes, le détail couleur ×
   *  taille est l'information utile — on l'ouvre d'office tant que l'utilisateur
   *  n'a pas exprimé son propre choix. */
  const autoExpandStockDetail = filteredStockStats.length > 0 && filteredStockStats.length <= 2;
  const isStockDetailOpen = (id: string) =>
    expandedStockModel === id || (!stockDetailTouched && autoExpandStockDetail);
  const toggleStockDetail = (id: string) => {
    const wasOpen = isStockDetailOpen(id);
    setStockDetailTouched(true);
    setExpandedStockModel(wasOpen ? null : id);
  };

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
    
    setFormStMode('facon');
    setFormPrestationType('CMT');
    setFormTissuFournisseur('CLIENT');
    setFormFournituresFournisseur('CLIENT');
    setFormConditionnementFournisseur('CLIENT');
    // Défaut = comportement historique : matière brute expédiée, coupe chez le
    // sous-traitant. Aucune commande existante n'est requalifiée.
    setFormCoupeLocation('SUBCONTRACTOR');
    setFormQtyAccepted(0);
    setFormQtyToRepair(0);
    setFormQtyRejected(0);
    setFormProtoRequired(1);
    setFormProtoStatus('PENDING');
    setFormPaymentTerms('AVANCE_RECEPTION');
    setFormDefectRateAccepted(1.5);
    setFormStitchingDetails('');
    setFormMaterialsFournisseur({});

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
      patchBatch({ grid: {} });
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
        patchBatch({ grid: newGrid, quantity: 0 });
      } else {
        setModelMaxGrid({});
        const qty = selected.meta_data.quantity || 0;
        setFormTotalQuantity(qty);
        patchBatch({ grid: {}, quantity: qty });
      }
    }
  };

  // Color-Size grid helpers for new order — mises à jour strictement immuables.
  const handleAddColor = () => {
    const color = newColorInput.trim();
    if (!color) return;
    patchBatch(b => {
      if (b.grid[color]) return {};
      const sizes: Record<string, number> = {};
      COMMON_SIZES.forEach(sz => { sizes[sz] = 0; });
      return { grid: { ...b.grid, [color]: sizes } };
    });
    setNewColorInput('');
  };

  const handleRemoveColor = (color: string) => {
    patchBatch(b => {
      const grid = { ...b.grid };
      delete grid[color];
      return { grid, quantity: sumGrid(grid) };
    });
  };

  const handleFillFullQuantity = () => {
    patchBatch(b => {
      const grid: Record<string, Record<string, number>> = {};
      Object.keys(b.grid).forEach(color => {
        grid[color] = {};
        Object.keys(b.grid[color]).forEach(sz => {
          grid[color][sz] = modelMaxGrid[color]?.[sz] || 0;
        });
      });
      return { grid, quantity: sumGrid(grid) };
    });
  };

  const handleUpdateGridQty = (color: string, size: string, qty: number) => {
    const cleanQty = Math.max(0, qty || 0);
    patchBatch(b => {
      if (!b.grid[color]) return {};
      const grid = { ...b.grid, [color]: { ...b.grid[color], [size]: cleanQty } };
      return { grid, quantity: sumGrid(grid) };
    });
  };

  /** Libellé du modèle porté par la commande (plus de texte français en dur). */
  const resolveModelName = (modelId: string): string => {
    if (modelId === 'MANUAL') {
      return tx(lang,{fr:'Commande Directe',ar:'طلبية مباشرة',en:'Direct Order',es:'Pedido Directo',pt:'Encomenda Direta',tr:'Doğrudan Sipariş'});
    }
    return models.find(m => m.id === modelId)?.meta_data?.nom_modele
      || tx(lang,{fr:'Inconnu',ar:'غير معروف',en:'Unknown',es:'Desconocido',pt:'Desconhecido',tr:'Bilinmiyor'});
  };

  /** Garde-fous financiers communs à la création ET à l'édition (A3).
   *  Retourne un message d'erreur traduit, ou `null` si tout est cohérent. */
  const validateOrderForm = (opts: { total: number; price: number; accepted: number; toRepair: number; rejected: number }): string | null => {
    if (!(opts.total > 0)) {
      return tx(lang,{fr:'La quantité totale doit être supérieure à 0.',ar:'الكمية الإجمالية يجب أن تكون أكبر من 0.',en:'The total quantity must be greater than 0.',es:'La cantidad total debe ser mayor que 0.',pt:'A quantidade total deve ser superior a 0.',tr:'Toplam miktar 0\'dan büyük olmalıdır.'});
    }
    if (!(opts.price >= 0) || !Number.isFinite(opts.price)) {
      return tx(lang,{fr:'Le tarif par pièce ne peut pas être négatif.',ar:'سعر القطعة لا يمكن أن يكون سالباً.',en:'The price per piece cannot be negative.',es:'El precio por pieza no puede ser negativo.',pt:'O preço por peça não pode ser negativo.',tr:'Birim fiyat negatif olamaz.'});
    }
    if (opts.accepted < 0 || opts.toRepair < 0 || opts.rejected < 0) {
      return tx(lang,{fr:'Les quantités contrôlées ne peuvent pas être négatives.',ar:'الكميات المراقَبة لا يمكن أن تكون سالبة.',en:'Inspected quantities cannot be negative.',es:'Las cantidades controladas no pueden ser negativas.',pt:'As quantidades controladas não podem ser negativas.',tr:'Kontrol edilen miktarlar negatif olamaz.'});
    }
    const controlled = opts.accepted + opts.toRepair + opts.rejected;
    if (controlled > opts.total) {
      return tx(lang,{
        fr:`Incohérence : acceptées + à retoucher + rejetées (${controlled}) dépasse la quantité totale (${opts.total}).`,
        ar:`تناقض: المقبولة + قيد التعديل + المرفوضة (${controlled}) تتجاوز الكمية الإجمالية (${opts.total}).`,
        en:`Inconsistency: accepted + to rework + rejected (${controlled}) exceeds the total quantity (${opts.total}).`,
        es:`Incoherencia: aceptadas + por retocar + rechazadas (${controlled}) supera la cantidad total (${opts.total}).`,
        pt:`Incoerência: aceites + por retocar + rejeitadas (${controlled}) excede a quantidade total (${opts.total}).`,
        tr:`Tutarsızlık: kabul + rötuş + ret (${controlled}) toplam miktarı (${opts.total}) aşıyor.`,
      });
    }
    return null;
  };

  // Submit new subcontract order
  const handleAddOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formSubcontractorName.trim()) {
      setError(tx(lang,{fr:'Veuillez specifier le nom du sous-traitant.',ar:'يرجى تحديد اسم المقاول من الباطن.',en:'Please specify the subcontractor name.',es:'Por favor, especifique el nombre del subcontratista.',pt:'Por favor, especifique o nome do subcontratado.',tr:'Lütfen taşeron adını belirtin.'}));
      return;
    }

    const invalid = validateOrderForm({
      total: effectiveTotalQuantity, price: formPricePerPiece, accepted: 0, toRepair: 0, rejected: 0,
    });
    if (invalid) { setError(invalid); return; }

    setActionLoading(true);
    const modelName = resolveModelName(formModelId);

    const gridJson = serializeGrid(batches[0].grid);

    const body = {
      modelId: formModelId,
      modelName,
      clientName: formClientName,
      totalQuantity: effectiveTotalQuantity,
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
      coupeLocation: formCoupeLocation,
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
      // La commande créée n'est pas encore dans `orders` : on construit le
      // minimum nécessaire au lien plutôt que d'attendre le rechargement.
      const created = await res.json().catch(() => null);
      await syncOrderToModel({
        ...(body as any),
        id: created?.id || '',
        totalQuantity: effectiveTotalQuantity,
        pricePerPiece: formPricePerPiece,
      } as SubcontractOrder, formStMode);
      fetchData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || tx(lang,{fr:'Une erreur est survenue.',ar:'حدث خطأ.',en:'An error occurred.',es:'Ocurrió un error.',pt:'Ocorreu um erro.',tr:'Bir hata oluştu.'}));
    } finally {
      setActionLoading(false);
    }
  };

  /** Répercute une commande de sous-traitance sur la fiche de coût de son modèle.
   *
   *  AUTOMATIQUE et silencieux : la commande est la décision commerciale réelle,
   *  le prix de revient du modèle doit donc toujours la refléter. Le lien couvre
   *  le tarif, le mode, la quantité commandée et l'identifiant de la commande.
   *  Règle métier inchangée : Façon = matières + prix ; Tout compris = prix seul.
   *
   *  `active` n'est mis à `true` QUE si le tarif est renseigné : activer la
   *  sous-traitance à 0 remplacerait la main d'œuvre calculée par zéro et ferait
   *  vendre à perte. Une commande encore sans tarif se contente donc de rattacher
   *  le modèle (orderId / orderQty) sans toucher au mode de calcul.
   *  La désactivation reste manuelle : on ne coupe jamais un lien tout seul.
   *
   *  Le mode explicite choisi dans le formulaire prime ; sinon il est déduit des
   *  fournisseurs de la commande (`inferSubcontractMode`, prudent par défaut). */
  const syncOrderToModel = async (order: SubcontractOrder, mode?: StMode) => {
    const price = Number(order.pricePerPiece) || 0;
    await writeModelSoustraitance(order.modelId, {
      ...(price > 0 ? { active: true } : {}),
      // `orderId` n'est écrit que s'il est connu : juste après la création, la
      // réponse de l'API peut ne pas le porter — la réconciliation le posera.
      ...(order.id ? { orderId: order.id } : {}),
      mode: mode ?? inferSubcontractMode(order),
      prix: price,
      orderQty: Number(order.totalQuantity) || 0,
    });
  };

  /** Réconciliation au chargement : une commande a pu être créée ou modifiée
   *  ailleurs (autre poste, autre onglet, import) pendant que le modèle dormait.
   *  On réaligne les fiches de coût dès que les deux listes sont disponibles.
   *  `writeModelSoustraitance` n'écrit que ce qui diffère : le second passage est
   *  un no-op et la boucle d'effet se stabilise immédiatement. */
  useEffect(() => {
    if (loading || orders.length === 0 || models.length === 0) return;
    // Un modèle peut porter plusieurs commandes : la plus récente fait foi.
    const latestByModel = new Map<string, SubcontractOrder>();
    orders.forEach(o => {
      if (!o.modelId || o.modelId === 'MANUAL') return;
      const prev = latestByModel.get(o.modelId);
      if (!prev || String(o.created_at || '') > String(prev.created_at || '')) {
        latestByModel.set(o.modelId, o);
      }
    });
    latestByModel.forEach(o => { void syncOrderToModel(o); });
  }, [orders, models, loading]);

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

    // Valeur initiale du sélecteur explicite (A6) : déduite de TOUS les champs
    // fournisseur, pas du seul tissu, et conservatrice en cas d'ambiguïté.
    setFormStMode(inferSubcontractMode(order));
    setFormPrestationType(order.prestationType || 'CMT');
    setFormTissuFournisseur(order.tissuFournisseur || 'CLIENT');
    setFormFournituresFournisseur(order.fournituresFournisseur || 'CLIENT');
    setFormConditionnementFournisseur(order.conditionnementFournisseur || 'CLIENT');
    setFormCoupeLocation(readCoupeLocation(order));
    setFormProtoRequired(order.protoRequired !== undefined ? order.protoRequired : 1);
    setFormProtoStatus(order.protoStatus || 'PENDING');
    setFormPaymentTerms(order.paymentTerms || 'AVANCE_RECEPTION');
    setFormDefectRateAccepted(order.defectRateAccepted !== undefined ? order.defectRateAccepted : 1.5);
    setFormStitchingDetails(order.stitchingDetails || '');
    setFormMaterialsFournisseur(parseJsonSafe(order.materials_fournisseur_json, {} as Record<string, string>));

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
    setError(null);

    const invalid = validateOrderForm({
      total: effectiveTotalQuantity,
      price: formPricePerPiece,
      accepted: formQtyAccepted,
      toRepair: formQtyToRepair,
      rejected: formQtyRejected,
    });
    if (invalid) { setError(invalid); return; }

    setActionLoading(true);

    const gridJson = serializeGrid(batches[0].grid);
    const modelName = resolveModelName(formModelId);

    const body = {
      modelId: formModelId,
      modelName,
      clientName: formClientName,
      totalQuantity: effectiveTotalQuantity,
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
      coupeLocation: formCoupeLocation,
      protoRequired: formProtoRequired,
      protoStatus: formProtoStatus,
      paymentTerms: formPaymentTerms,
      defectRateAccepted: formDefectRateAccepted,
      stitchingDetails: formStitchingDetails || null,
      materials_fournisseur_json: JSON.stringify(
        Object.fromEntries(Object.entries(formMaterialsFournisseur).filter(([, v]) => v && v.trim()))
      )
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
      // A5 : le lien vers le coût de revient ne vivait qu'à la création. On le
      // rejoue à CHAQUE édition — tarif, mode ET quantité pèsent tous sur le prix
      // de revient (la quantité sert de base de répartition des frais).
      await syncOrderToModel(
        { ...selectedOrder, ...(body as any), modelId: formModelId, pricePerPiece: formPricePerPiece },
        formStMode,
      );
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
      setError(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || tx(lang,{fr:'Erreur de communication',ar:'خطأ في الاتصال',en:'Communication error',es:'Error de comunicación',pt:'Erro de comunicação',tr:'İletişim hatası'}));
    }
  };

  /** Bascule un des quatre jalons logistiques directement depuis la pastille.
   *  Ces champs n'ont plus d'onglet dédié dans le formulaire : la pastille EST
   *  le contrôle. Mise à jour optimiste pour que le clic réponde tout de suite,
   *  avec retour à l'état précédent si le serveur refuse. */
  const applyToggleMilestone = async (
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
      setError(err.message || tx(lang,{fr:'Erreur de communication',ar:'خطأ في الاتصال',en:'Communication error',es:'Error de comunicación',pt:'Erro de comunicação',tr:'İletişim hatası'}));
    }
  };

  /** L'évaluation se donne PAR COMMANDE (une prestation = une note), jamais
   *  globalement sur le sous-traitant : la note affichée sur sa fiche est la
   *  moyenne de ses commandes notées. Cliquer la même étoile annule la note. */
  const handleRateOrder = async (order: SubcontractOrder, rating: number) => {
    const next = order.subcontractorRating === rating ? undefined : rating;
    const patch: Partial<SubcontractOrder> = { subcontractorRating: next };

    setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, ...patch } : o)));
    setDetailOrder(prev => (prev && prev.id === order.id ? { ...prev, ...patch } : prev));

    try {
      const res = await fetch(`/api/subcontract/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subcontractorRating: next ?? null })
      });
      if (!res.ok) throw new Error(tx(lang,{fr:'Echec de la mise à jour',ar:'فشل التحديث',en:'Update failed',es:'Error al actualizar',pt:'Falha na atualização',tr:'Güncelleme başarısız'}));
    } catch (err: any) {
      setOrders(prev => prev.map(o => (o.id === order.id ? order : o)));
      setDetailOrder(prev => (prev && prev.id === order.id ? order : prev));
      setError(err.message || tx(lang,{fr:'Erreur de communication',ar:'خطأ في الاتصال',en:'Communication error',es:'Error de comunicación',pt:'Erro de comunicação',tr:'İletişim hatası'}));
    }
  };

  /** Un jalon dit « le tissu est parti », « la FT est envoyée » : c'est une
   *  déclaration engageante, lue ailleurs dans l'application. Un clic par
   *  inadvertance ne doit pas la produire, ni l'effacer — d'où la confirmation.
   *  Le libellé rappelle le sens EXACT du basculement demandé. */
  const requestToggleMilestone = (
    order: SubcontractOrder,
    field: 'tissuStatus' | 'fournituresStatus' | 'ficheTechniqueSent' | 'protoStatus'
  ) => {
    const isOn =
      field === 'tissuStatus' ? order.tissuStatus === 'SENT'
      : field === 'fournituresStatus' ? order.fournituresStatus === 'DELIVERED'
      : field === 'ficheTechniqueSent' ? order.ficheTechniqueSent === 1
      : order.protoStatus === 'APPROVED';
    setMilestoneConfirm({ order, field, isOn });
  };

  /** Persiste la liste de jalons libres après une opération locale (ajout,
   *  bascule, suppression) — optimiste, avec retour à l'état précédent si le
   *  serveur refuse. Contrairement aux 4 jalons fixes, ces jalons n'ont aucune
   *  signification métier consommée ailleurs : c'est une checklist libre. */
  const persistCustomMilestones = async (order: SubcontractOrder, next: CustomMilestone[], previous: CustomMilestone[]) => {
    const isModalOrder = detailOrder?.id === order.id;
    if (isModalOrder) setCustomMilestones(next);
    setMilestoneSaving(true);
    setMilestoneError(null);
    try {
      const res = await fetch(`/api/subcontract/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ custom_milestones_json: JSON.stringify(next) })
      });
      if (!res.ok) throw new Error(tx(lang,{fr:'Echec de la mise à jour',ar:'فشل التحديث',en:'Update failed',es:'Error al actualizar',pt:'Falha na atualização',tr:'Güncelleme başarısız'}));
      const patch = { custom_milestones_json: JSON.stringify(next) };
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, ...patch } : o)));
      setDetailOrder(prev => (prev && prev.id === order.id ? { ...prev, ...patch } : prev));
    } catch (err: any) {
      if (isModalOrder) setCustomMilestones(previous);
      setMilestoneError(err.message || tx(lang,{fr:'Erreur de communication',ar:'خطأ في الاتصال',en:'Communication error',es:'Error de comunicación',pt:'Erro de comunicação',tr:'İletişim hatası'}));
    } finally {
      setMilestoneSaving(false);
    }
  };

  const handleAddCustomMilestone = (order: SubcontractOrder) => {
    const label = newMilestoneLabel.trim();
    // Le message de saisie n'était effacé que par un enregistrement réussi : une
    // fois « Indiquez un nom » affiché, il restait à l'écran même après avoir
    // tapé un nom, et survivait à la fermeture de la fiche. On repart propre à
    // chaque tentative.
    setMilestoneError(null);
    if (!label) {
      setMilestoneError(tx(lang,{fr:'Indiquez un nom pour le jalon.',ar:'حدّد اسماً للمرحلة.',en:'Enter a name for the milestone.',es:'Indique un nombre para el hito.',pt:'Indique um nome para o marco.',tr:'Kilometre taşı için bir ad girin.'}));
      return;
    }
    const next = [...customMilestones, { id: `cm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, label, done: false }];
    setNewMilestoneLabel('');
    persistCustomMilestones(order, next, customMilestones);
  };

  const handleToggleCustomMilestone = (order: SubcontractOrder, id: string) => {
    const current = readCustomMilestones(order);
    const next = current.map(m => (m.id === id ? { ...m, done: !m.done } : m));
    persistCustomMilestones(order, next, current);
  };

  const handleRemoveCustomMilestone = (order: SubcontractOrder, id: string) => {
    const current = readCustomMilestones(order);
    const next = current.filter(m => m.id !== id);
    persistCustomMilestones(order, next, current);
  };

  const handleRenameCustomMilestone = (order: SubcontractOrder, id: string) => {
    const label = editingMilestoneLabel.trim();
    setEditingMilestoneId(null);
    if (!label) return;
    const current = readCustomMilestones(order);
    const next = current.map(m => (m.id === id ? { ...m, label } : m));
    persistCustomMilestones(order, next, current);
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
  // Retourne true uniquement si la commande a bien ete supprimee cote serveur,
  // pour que l'appelant ne ferme la modale qu'en cas de succes reel.
  const handleDeleteOrder = async (orderId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/subcontract/${orderId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.message || tx(lang,{fr:'Echec de la suppression',ar:'فشل الحذف',en:'Deletion failed',es:'Error al eliminar',pt:'Falha ao eliminar',tr:'Silme başarısız'}));
      }
      setError(null);
      await fetchData();
      return true;
    } catch (err: any) {
      setError(err.message || tx(lang,{fr:'Une erreur est survenue.',ar:'حدث خطأ.',en:'An error occurred.',es:'Ocurrió un error.',pt:'Ocorreu um erro.',tr:'Bir hata oluştu.'}));
      return false;
    }
  };

  const confirmDeleteOrder = async () => {
    if (!orderPendingDelete || isDeletingOrder) return;
    setIsDeletingOrder(true);
    const ok = await handleDeleteOrder(orderPendingDelete.id);
    setIsDeletingOrder(false);
    if (!ok) return;
    setOrderPendingDelete(null);
    setIsEditModalOpen(false);
    setSelectedOrder(null);
  };

  // Open Sale Invoice Modal for a model (Tab 3)
  const openSaleModal = async (item: { model: ModelData, remainingStock: number, price: number | null, salePrice?: number | null }) => {
    setSelectedModelForSale(item.model);
    setSaleClient(item.model.ficheData?.client || '');
    setSaleClientIce('');
    setSaleClientRc('');
    setSaleClientAdresse('');
    setSaleClientTel('');
    setSaleClientEmail('');
    setSaleQuantity(item.remainingStock);
    // Prix de VENTE de la fiche de coût. L'écran proposait auparavant le prix de
    // REVIENT : accepter la proposition telle quelle revenait à vendre à prix
    // coûtant, marge nulle, sans que rien ne l'indique. À défaut de prix de
    // vente saisi, le champ reste VIDE et obligatoire.
    setSalePrice(item.salePrice != null && item.salePrice > 0 ? Number(item.salePrice.toFixed(2)) : '');
    setSaleTvaRate(20);
    setSaleNotes(tx(lang,{fr:'Sortie de stock sous-traitance pour le modele',ar:'إخراج من مخزون المقاولة من الباطن للموديل',en:'Subcontract stock exit for model',es:'Salida de stock de subcontratación para el modelo',pt:'Saída de stock de subcontratação para o modelo',tr:'Taşeron stok çıkışı model için'}) + ` ${item.model.meta_data.nom_modele}`);
    setSaleStatus('BROUILLON');

    // A4 : le numéro de facture vient du serveur. Aucune valeur aléatoire de
    // repli — deux factures homonymes fausseraient la comptabilité.
    setSaleInvoiceNumber('');
    setSaleNumberError(null);
    setSaleNumberLoading(true);
    setIsSaleModalOpen(true);
    try {
      const res = await fetch('/api/subcontract/next-invoice-number', { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const number = typeof data?.number === 'string' ? data.number.trim() : '';
      if (!number) throw new Error('empty');
      setSaleInvoiceNumber(number);
    } catch (err) {
      console.error('[SousTraitance] next-invoice-number', err);
      setSaleNumberError(tx(lang,{
        fr:"Numéro de facture indisponible : le serveur n'a pas répondu. Impossible d'émettre la facture — réessayez.",
        ar:'رقم الفاتورة غير متاح: الخادم لم يستجب. لا يمكن إصدار الفاتورة — أعد المحاولة.',
        en:'Invoice number unavailable: the server did not respond. The invoice cannot be issued — please retry.',
        es:'Número de factura no disponible: el servidor no respondió. No se puede emitir la factura — reinténtelo.',
        pt:'Número de fatura indisponível: o servidor não respondeu. Não é possível emitir a fatura — tente novamente.',
        tr:'Fatura numarası alınamadı: sunucu yanıt vermedi. Fatura kesilemez — tekrar deneyin.',
      }));
    } finally {
      setSaleNumberLoading(false);
    }
  };

  // Submit sale invoice (Tab 3)
  const handleSaveSaleInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModelForSale) return;
    setError(null);

    if (saleQuantity <= 0) {
      setError(tx(lang,{fr:'La quantite vendue doit etre superieure a 0.',ar:'الكمية المباعة يجب أن تكون أكبر من 0.',en:'The sold quantity must be greater than 0.',es:'La cantidad vendida debe ser mayor que 0.',pt:'A quantidade vendida deve ser superior a 0.',tr:'Satılan miktar 0\'dan büyük olmalıdır.'}));
      return;
    }

    if (salePrice === '' || !(Number(salePrice) >= 0)) {
      setError(tx(lang,{fr:'Veuillez saisir un prix unitaire.',ar:'يرجى إدخال سعر الوحدة.',en:'Please enter a unit price.',es:'Por favor, introduzca un precio unitario.',pt:'Por favor, introduza um preço unitário.',tr:'Lütfen bir birim fiyat girin.'}));
      return;
    }

    // A4 : sans numéro validé par le serveur, on bloque l'émission.
    if (!saleInvoiceNumber.trim()) {
      setError(saleNumberError || tx(lang,{fr:"Numéro de facture manquant : émission bloquée.",ar:'رقم الفاتورة ناقص: الإصدار موقوف.',en:'Missing invoice number: issuing blocked.',es:'Falta el número de factura: emisión bloqueada.',pt:'Número de fatura em falta: emissão bloqueada.',tr:'Fatura numarası eksik: kesim engellendi.'}));
      return;
    }

    setActionLoading(true);
    const unitPrice = Number(salePrice);
    const totalHT = saleQuantity * unitPrice;
    const totalTVA = (totalHT * saleTvaRate) / 100;
    const totalTTC = totalHT + totalTVA;

    // Build lines array matching database convention
    const lines = [{
      designation: `Modele: ${selectedModelForSale.meta_data.nom_modele} (Ref: ${selectedModelForSale.meta_data.reference || 'N/A'})`,
      qte: saleQuantity,
      prix_unitaire: unitPrice,
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
      setError(err.message || tx(lang,{fr:'Une erreur est survenue lors de la facturation.',ar:'حدث خطأ أثناء إصدار الفاتورة.',en:'An error occurred during invoicing.',es:'Ocurrió un error durante la facturación.',pt:'Ocorreu um erro durante a faturação.',tr:'Faturalama sırasında bir hata oluştu.'}));
    } finally {
      setActionLoading(false);
    }
  };

  // Print Invoice (Tab 3 Invoice template preview)
  const handlePrintSaleInvoice = () => {
    // Échappement HTML : ces valeurs viennent de la saisie utilisateur et
    // partent dans un document écrit à la main.
    const esc2 = (v: unknown) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    if (!selectedModelForSale) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const unitPrice = Number(salePrice) || 0;
    const totalHT = saleQuantity * unitPrice;
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
        <body>
          <div class="invoice-box">
            <div class="header">
              <div>
                <div class="logo">${companyIdentity.nom || saleClient || ""}</div>
                <div style="color: #64748b; font-weight: 500; font-size: 11px;">${[companyIdentity.ice ? `ICE : ${companyIdentity.ice}` : "", companyIdentity.rc ? `RC : ${companyIdentity.rc}` : ""].filter(Boolean).join(" · ")}</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 18px; font-weight: 800; color: #1e1b4b;">${tx(lang,{fr:'FACTURE DE VENTE',ar:'فاتورة بيع',en:'SALE INVOICE',es:'FACTURA DE VENTA',pt:'FATURA DE VENDA',tr:'SATIŞ FATURASI'})}</div>
                <div style="font-size: 12px; font-weight: 600; color: #4f46e5; margin-top: 4px;">N° ${saleInvoiceNumber}</div>
              </div>
            </div>

            <div class="meta-section">
              <div class="box">
                <div class="title">${tx(lang,{fr:'Émetteur',ar:'المصدر',en:'Issuer',es:'Emisor',pt:'Emitente',tr:'Düzenleyen'})}</div>
                <div class="val">${companyIdentity.nom || ""}</div>
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
                  <td style="text-align: right;">${saleQuantity.toLocaleString(dateLocale)} pcs</td>
                  <td style="text-align: right;">${unitPrice.toLocaleString(dateLocale)} ${currency}</td>
                  <td style="text-align: right; font-weight: 600;">${totalHT.toLocaleString(dateLocale)} ${currency}</td>
                </tr>
              </tbody>
            </table>

            <table class="total-table">
              <tr>
                <td style="color: #64748b;">Total HT</td>
                <td style="text-align: right; font-weight: 600;">${totalHT.toLocaleString(dateLocale)} ${currency}</td>
              </tr>
              <tr>
                <td style="color: #64748b;">TVA (${saleTvaRate}%)</td>
                <td style="text-align: right; font-weight: 600;">${totalTVA.toLocaleString(dateLocale)} ${currency}</td>
              </tr>
              <tr class="total-row">
                <td>Total TTC</td>
                <td style="text-align: right;">${totalTTC.toLocaleString(dateLocale)} ${currency}</td>
              </tr>
            </table>

            ${saleNotes ? `
              <div style="background: #f8fafc; border-left: 3px solid #cbd5e1; padding: 12px; margin-top: 40px; border-radius: 4px;">
                <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">${tx(lang,{fr:'Observations / Notes',ar:'ملاحظات',en:'Remarks / Notes',es:'Observaciones / Notas',pt:'Observações / Notas',tr:'Gözlemler / Notlar'})}</div>
                <div style="margin-top: 4px; font-style: italic; color: #334155;">${saleNotes}</div>
              </div>
            ` : ''}

            <div class="footer">
              ${esc2(companyIdentity.nom || '')}${companyIdentity.adresse ? ` — ${esc2(companyIdentity.adresse)}` : ''}<br/>
              ${tx(lang,{fr:'Document généré électroniquement et valable sans signature.',ar:'مستند تم إنشاؤه إلكترونياً وصالح بدون توقيع.',en:'Electronically generated document valid without signature.',es:'Documento generado electrónicamente y válido sin firma.',pt:'Documento gerado eletronicamente e válido sem assinatura.',tr:'Elektronik olarak oluşturulmuş, imzasız geçerli belge.'})}
            </div>
          </div>
                  ${autoFitScript(20)}
</body>
      </html>
    `);
    printWindow.document.close();
  };

  // ======================================================================
  // BON D'ENVOI — préparation avant impression
  // Le bon partait autrefois directement à l'imprimante avec les données
  // brutes de la commande. Or c'est le document que le sous-traitant SIGNE :
  // il doit pouvoir être relu et corrigé (libellés, quantités réellement
  // chargées dans le camion, identités légales) avant d'être remis. D'où la
  // même mécanique que la facture : une modale de préparation.
  // ======================================================================

  /** Ligne « couleur » du bon, clé stable pour cocher / éditer. */
  interface BonEnvoiRow { key: string; color: string; detail: [string, number][]; total: number }

  /** B2 : les quantités réelles viennent de `grid_json` (matrice couleur × taille).
   *  Un rendu naïf ferait un produit cartésien : pour CHAQUE couleur il répéterait
   *  le détail des tailles toutes couleurs confondues — le bon remis au
   *  sous-traitant annoncerait donc des quantités fausses. */
  const buildBonEnvoiRows = (order: SubcontractOrder): BonEnvoiRow[] => {
    const parsedGrid = parseJsonSafe(order.grid_json, null as any);
    const grid: Record<string, Record<string, number>> | null =
      parsedGrid && typeof parsedGrid === 'object' && Object.keys(parsedGrid).length > 0 ? parsedGrid : null;
    const sizeTotals: Record<string, number> = parseJsonSafe(order.sizes_json);

    if (grid) {
      return Object.entries(grid)
        .map(([color, sizesObj]) => {
          const detail = Object.entries(sizesObj || {})
            .map(([sz, q]) => [sz, Number(q) || 0] as [string, number])
            .filter(([, q]) => q > 0);
          return { key: `row-${color}`, color, detail, total: detail.reduce((a, [, q]) => a + q, 0) };
        })
        .filter(r => r.total > 0);
    }
    return [{
      key: 'row-standard',
      color: tx(lang,{fr:'Standard',ar:'قياسي',en:'Standard',es:'Estándar',pt:'Padrão',tr:'Standart'}),
      detail: Object.entries(sizeTotals)
        .map(([sz, q]) => [sz, Number(q) || 0] as [string, number])
        .filter(([, q]) => q > 0),
      total: order.totalQuantity,
    }];
  };

  /** Jalons imprimables : les 4 jalons fixes + la checklist libre de la commande. */
  /** Lignes de DÉTAIL du bon d'envoi : la façon confiée et les matières qui
   *  partent avec. Même lecture que « Détail de la facture », mais SANS aucun
   *  montant : un bon d'envoi qui porte des prix devient une facture, et le
   *  sous-traitant n'a pas à connaître le coût des matières qu'il reçoit. */
  const buildBonEnvoiDetail = (order: SubcontractOrder) => {
    const lines: { key: string; type: string; label: string; qty: number; unit: string }[] = [
      {
        key: 'det-facon',
        type: tx(lang,{fr:'Façon',ar:'الخياطة',en:'Making',es:'Confección',pt:'Confeção',tr:'Fason'}),
        label: order.modelName || order.modelId,
        qty: order.totalQuantity,
        unit: 'pcs',
      },
    ];

    // Les matières ne partent qu'en mode Façon : en « tout compris » c'est le
    // sous-traitant qui les fournit, les lister n'aurait aucun sens.
    if (inferSubcontractMode(order) === 'facon') {
      getFaconMaterialsNeeds(order, parseJsonSafe(order.materials_fournisseur_json, {} as Record<string, string>))
        .forEach(m => lines.push({
          key: `det-mat-${m.id}`,
          type: tx(lang,{fr:'Matière',ar:'مادة',en:'Material',es:'Material',pt:'Material',tr:'Malzeme'}),
          label: m.name,
          qty: m.buyQty,
          unit: m.unit,
        }));
    }
    return lines;
  };

  const buildBonEnvoiMilestones = (order: SubcontractOrder) => ([
    { key: 'ms-tissu', label: tx(lang,{fr:'Tissu expédié',ar:'القماش مُرسَل',en:'Fabric shipped',es:'Tejido enviado',pt:'Tecido expedido',tr:'Kumaş sevk edildi'}), done: order.tissuStatus === 'SENT' },
    { key: 'ms-fournitures', label: tx(lang,{fr:'Fournitures livrées',ar:'اللوازم مُسلَّمة',en:'Supplies delivered',es:'Fornituras entregadas',pt:'Acessórios entregues',tr:'Malzemeler teslim edildi'}), done: order.fournituresStatus === 'DELIVERED' },
    { key: 'ms-ft', label: tx(lang,{fr:'Fiche technique envoyée',ar:'البطاقة الفنية مُرسَلة',en:'Tech sheet sent',es:'Ficha técnica enviada',pt:'Ficha técnica enviada',tr:'Teknik föy gönderildi'}), done: order.ficheTechniqueSent === 1 },
    { key: 'ms-proto', label: tx(lang,{fr:'Prototype validé',ar:'النموذج الأولي معتمد',en:'Prototype approved',es:'Prototipo validado',pt:'Protótipo validado',tr:'Prototip onaylandı'}), done: order.protoStatus === 'APPROVED' },
    ...readCustomMilestones(order).map(m => ({ key: `ms-${m.id}`, label: m.label, done: m.done })),
  ]);

  const [isBonEnvoiModalOpen, setIsBonEnvoiModalOpen] = useState(false);
  const [bonEnvoiOrder, setBonEnvoiOrder] = useState<SubcontractOrder | null>(null);
  /** Éléments DÉCOCHÉS (clés `row-…` et `ms-…`). Par défaut tout est coché :
   *  un bon complet reste le cas normal, retirer une ligne est un geste
   *  conscient. Ce qui est décoché disparaît du document ET du total imprimé. */
  const [bonEnvoiOff, setBonEnvoiOff] = useState<Set<string>>(new Set());
  /** Réécritures manuelles d'une ligne (libellé couleur / quantité chargée).
   *  La ligne garde sa valeur d'origine tant que rien n'est saisi : on n'écrase
   *  jamais la donnée de la commande en silence, et un bouton revient dessus. */
  const [bonEnvoiEdits, setBonEnvoiEdits] = useState<Record<string, { label?: string; qty?: number }>>({});
  const editBonEnvoiRow = (key: string, patch: { label?: string; qty?: number }) =>
    setBonEnvoiEdits(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const resetBonEnvoiRow = (key: string) =>
    setBonEnvoiEdits(prev => { const n = { ...prev }; delete n[key]; return n; });
  const toggleBonEnvoiKey = (key: string) => setBonEnvoiOff(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  /** Blocs et visuels à faire figurer sur le document imprimé. */
  const [bonEnvoiShow, setBonEnvoiShow] = useState<{
    detail: boolean;
    logo: boolean; model: boolean; subcontractor: boolean;
    sizeDetail: boolean; milestones: boolean; notes: boolean; materials: boolean;
  }>({ detail: true, logo: true, model: true, subcontractor: false, sizeDetail: true, milestones: false, notes: true, materials: false });
  /** Notes du bon : pré-remplies depuis la commande mais propres au document —
   *  une consigne de transport n'a pas à polluer la fiche de la commande. */
  const [bonEnvoiNotes, setBonEnvoiNotes] = useState('');
  /** « Matières à prévoir » : liste libre, une par ligne. Elle sert au
   *  sous-traitant qui doit approvisionner lui-même certaines fournitures. */
  const [bonEnvoiMaterials, setBonEnvoiMaterials] = useState('');
  /** Identités imprimées. Pré-remplies (entreprise + fiche sous-traitant) et
   *  corrigibles ICI : un ICE communiqué à la dernière minute ne doit pas
   *  obliger à quitter le bon. Les fiches restent les sources, on ne les
   *  réécrit pas en douce. */
  const [bonEnvoiIssuer, setBonEnvoiIssuer] = useState<{ nom: string; ice: string; rc: string; adresse: string; tel: string }>(
    { nom: '', ice: '', rc: '', adresse: '', tel: '' }
  );
  const [bonEnvoiTiers, setBonEnvoiTiers] = useState<{ nom: string; ice: string; rc: string; adresse: string; tel: string }>(
    { nom: '', ice: '', rc: '', adresse: '', tel: '' }
  );
  /** Date d'expédition portée sur le bon (ISO). Vide = date du jour. */
  const [bonEnvoiDate, setBonEnvoiDate] = useState('');

  /** Ouvre la préparation du bon d'envoi : tout est remis à l'état de la
   *  commande, pour qu'un bon précédent ne laisse jamais traîner ses
   *  corrections sur la commande suivante. */
  const openBonEnvoiModal = (order: SubcontractOrder) => {
    setBonEnvoiOrder(order);
    setBonEnvoiOff(new Set());
    setBonEnvoiEdits({});
    setBonEnvoiShow({ detail: true, logo: true, model: true, subcontractor: false, sizeDetail: true, milestones: false, notes: true, materials: false });
    setBonEnvoiNotes(order.notes || '');
    setBonEnvoiMaterials('');
    setBonEnvoiDate('');
    {
      const prof = subcontractorProfiles.find(p => p.name === order.subcontractorName);
      setBonEnvoiTiers({
        nom: order.subcontractorName || '',
        ice: prof?.ice || '',
        rc: prof?.rc || '',
        adresse: prof?.address || '',
        tel: prof?.phone || order.subcontractorPhone || '',
      });
    }
    // L'émetteur repart TOUJOURS de la fiche Admin > Entreprise : un bon
    // précédent ne doit pas laisser traîner ses corrections sur le suivant.
    setBonEnvoiIssuer({
      nom: companyIdentity.nom, ice: companyIdentity.ice, rc: companyIdentity.rc,
      adresse: companyIdentity.adresse, tel: companyIdentity.tel,
    });
    setIsBonEnvoiModalOpen(true);
    // L'identité légale n'est pas forcément déjà chargée — ou l'utilisateur
    // vient de la compléter dans Admin : on la relit maintenant et on applique
    // ce qui arrive, sans écraser une correction déjà saisie ici.
    loadCompanyIdentity().then(id => {
      if (!id) return;
      setBonEnvoiIssuer(prev => ({
        nom: prev.nom || id.nom,
        ice: prev.ice || id.ice,
        rc: prev.rc || id.rc,
        adresse: prev.adresse || id.adresse,
        tel: prev.tel || id.tel,
      }));
    });
  };

  /** L'identité de l'entreprise arrive de façon asynchrone : on ne pré-remplit
   *  l'émetteur que sur les champs encore vides, pour ne jamais écraser une
   *  correction que l'utilisateur vient de saisir dans la modale. */
  useEffect(() => {
    if (!isBonEnvoiModalOpen) return;
    setBonEnvoiIssuer(prev => ({
      nom: prev.nom || companyIdentity.nom,
      ice: prev.ice || companyIdentity.ice,
      rc: prev.rc || companyIdentity.rc,
      adresse: prev.adresse || companyIdentity.adresse,
      tel: prev.tel || companyIdentity.tel,
    }));
    // Dépendances PRIMITIVES : `companyIdentity` est un objet recréé à chaque
    // chargement, ce qui relançait l'effet — et donc un rendu — sans qu'aucune
    // valeur n'ait changé.
  }, [isBonEnvoiModalOpen, companyIdentity.nom, companyIdentity.ice, companyIdentity.rc, companyIdentity.adresse, companyIdentity.tel]);

  // Helper to print subcontractor delivery bon/slip (Tab 1 action)
  const handlePrintDeliveryNote = (order: SubcontractOrder) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const esc = (v: unknown) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Seules les lignes cochées partent à l'impression, avec le libellé et la
    // quantité éventuellement corrigés dans la modale de préparation.
    const rows = buildBonEnvoiRows(order)
      .filter(r => !bonEnvoiOff.has(r.key))
      .map(r => {
        const edit = bonEnvoiEdits[r.key] || {};
        return {
          color: edit.label ?? r.color,
          detail: r.detail,
          total: edit.qty ?? r.total,
          edited: edit.qty != null && edit.qty !== r.total,
        };
      });

    // A : le parcours de coupe ne change AUCUN calcul, seulement les libellés.
    // En coupe interne ce sont des pièces déjà coupées qui partent, pas du tissu.
    const isInternalCut = readCoupeLocation(order) === 'INTERNAL';
    const shipmentNature = isInternalCut
      ? tx(lang,{fr:'Pièces coupées',ar:'قطع مقطوعة',en:'Cut pieces',es:'Piezas cortadas',pt:'Peças cortadas',tr:'Kesilmiş parçalar'})
      : tx(lang,{fr:'Tissu (matière brute)',ar:'قماش (مادة خام)',en:'Fabric (raw material)',es:'Tejido (materia prima)',pt:'Tecido (matéria-prima)',tr:'Kumaş (ham madde)'});
    const shipmentNatureHint = isInternalCut
      ? tx(lang,{fr:'Coupe réalisée en interne avant expédition.',ar:'القص تدار عندنا قبل الإرسال.',en:'Cutting done in-house before shipping.',es:'Corte realizado internamente antes del envío.',pt:'Corte realizado internamente antes da expedição.',tr:'Kesim sevkiyattan önce şirket içinde yapıldı.'})
      : tx(lang,{fr:'La coupe est réalisée par le sous-traitant.',ar:'القص كيديرو المقاول من الباطن.',en:'Cutting is done by the subcontractor.',es:'El corte lo realiza el subcontratista.',pt:'O corte é feito pelo subcontratado.',tr:'Kesim taşeron tarafından yapılır.'});
    const totalRowLabel = isInternalCut
      ? tx(lang,{fr:'TOTAL PIÈCES COUPÉES ENVOYÉES',ar:'مجموع القطع المقطوعة المرسلة',en:'TOTAL CUT PIECES SENT',es:'TOTAL DE PIEZAS CORTADAS ENVIADAS',pt:'TOTAL DE PEÇAS CORTADAS ENVIADAS',tr:'GÖNDERİLEN TOPLAM KESİLMİŞ PARÇA'})
      : tx(lang,{fr:'QUANTITÉ TOTALE ENVOYÉE',ar:'الكمية الإجمالية المرسلة',en:'TOTAL QUANTITY SENT',es:'CANTIDAD TOTAL ENVIADA',pt:'QUANTIDADE TOTAL ENVIADA',tr:'GÖNDERİLEN TOPLAM MİKTAR'});

    const rowsTotal = rows.reduce((a, r) => a + r.total, 0);
    // Écart entre ce qui part réellement et ce que la commande enregistre : on le
    // DIT sur le bon plutôt que de laisser le sous-traitant arbitrer seul. Le ton
    // change selon l'origine : un retrait volontaire (ligne décochée ou quantité
    // corrigée) est un envoi partiel assumé, un écart non voulu est une alerte.
    const intentional = bonEnvoiOff.size > 0 || Object.keys(bonEnvoiEdits).length > 0;
    const mismatch = rowsTotal !== order.totalQuantity;

    // Pastille de teinte sur le papier : le magasinier reconnaît la couleur sans
    // lire, exactement comme à l'écran.
    const modelPhoto = models.find(m => m.id === order.modelId)?.image || '';
    const stPhoto = subcontractorProfiles.find(p => p.name === order.subcontractorName)?.photo || '';
    // Vignettes en ligne : le visuel colle au nom qu'il illustre. DÉCLARÉES ICI,
    // avant tout bloc qui les emploie — plus bas, elles étaient dans la zone morte
    // temporelle du `const` et l'impression échouait sur une ReferenceError.
    const visualsBlock = '';
    const modelThumb = bonEnvoiShow.model ? inlineThumbHtml(modelPhoto, 20) : '';
    const stThumb = bonEnvoiShow.subcontractor ? inlineThumbHtml(stPhoto, 20) : '';
    // Photo de la matière : elle vit dans la fiche Magasin, appariée par nom
    // normalisé (casse et espaces indifférents).
    const materialPhoto = (name: string) => {
      const n = (v: any) => String(v ?? '').trim().toLowerCase();
      const item = magasinData.find((m: any) => n(m.nom || m.designation) === n(name));
      return (item as any)?.photo || (item as any)?.image || '';
    };

    const colorDotHtml = (name: string) => {
      const hex = colorHexOf(name);
      return hex
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(hex)};border:0.5px solid rgba(0,0,0,.2);margin-right:5px;vertical-align:middle;"></span>`
        : '';
    };

    // Colonnes de tailles, dans l'ordre du modèle quand il est connu — le
    // magasinier lit une grille, pas une phrase : « [s]: 30 | [m]: 40 | … »
    // obligeait à décoder chaque ligne pour vérifier un carton.
    const modelSizes: string[] = ((models.find(m => m.id === order.modelId)?.ficheData as any)?.sizes || []) as string[];
    const seenSizes = new Set<string>();
    rows.forEach(r => r.detail.forEach(([sz]) => seenSizes.add(sz)));
    const sizeCols = [
      ...modelSizes.filter(sz => seenSizes.has(sz)),
      ...[...seenSizes].filter(sz => !modelSizes.includes(sz)),
    ];
    const showSizes = bonEnvoiShow.sizeDetail && sizeCols.length > 0;

    const sizeHeadHtml = showSizes
      ? sizeCols.map(sz => `<th style="text-align:center;">${esc(sz)}</th>`).join('')
      : '';

    const rowsHtml = rows.map(r => {
      const bySize: Record<string, number> = {};
      r.detail.forEach(([sz, q]) => { bySize[sz] = (bySize[sz] || 0) + q; });
      const cells = showSizes
        ? sizeCols.map(sz => `<td style="text-align:center;">${bySize[sz] ? bySize[sz].toLocaleString(dateLocale) : '&mdash;'}</td>`).join('')
        : '';
      return `
                <tr>
                  <td style="font-weight: 800; color: #1e1b4b;">${colorDotHtml(r.color)}${esc(r.color)}</td>
                  ${cells}
                  <td style="text-align: right; font-weight: 800; color: #4f46e5;">${r.total.toLocaleString(dateLocale)} pcs</td>
                </tr>`;
    }).join('');

    // Pied de tableau : total par taille. C'est le chiffre qu'on recompte à la
    // réception, taille par taille.
    const sizeFootHtml = showSizes
      ? sizeCols.map(sz => {
          const t = rows.reduce((a, r) => a + r.detail.filter(([s2]) => s2 === sz).reduce((b, [, q]) => b + q, 0), 0);
          return `<td style="text-align:center; font-weight:800;">${t ? t.toLocaleString(dateLocale) : '&mdash;'}</td>`;
        }).join('')
      : '';

    // Détail des lignes envoyées (façon + matières), quantités seules.
    const detailLines = buildBonEnvoiDetail(order).filter(l => !bonEnvoiOff.has(l.key));
    const detailBlock = (!bonEnvoiShow.detail || detailLines.length === 0) ? '' : `
          <table>
            <thead>
              <tr>
                <th>${esc(tx(lang,{fr:"Détail de l'envoi",ar:'تفصيل الإرسال',en:'Shipment details',es:'Detalle del envío',pt:'Detalhe da remessa',tr:'Sevkiyat detayı'}))}</th>
                <th style="text-align: right;">${esc(tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'}))}</th>
              </tr>
            </thead>
            <tbody>
              ${detailLines.map(l => {
                const edit = bonEnvoiEdits[l.key] || {};
                const qty = edit.qty ?? l.qty;
                return `
                <tr>
                  <td><span style="font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">${esc(l.type)}</span><br/><span style="font-weight:700;">${l.key === 'det-facon' ? modelThumb : inlineThumbHtml(materialPhoto(l.label), 18)}${esc(edit.label ?? l.label)}</span></td>
                  <td style="text-align: right; font-weight: 700;">${esc(fmt(qty))} ${esc(l.unit)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
    `;

    const mismatchHtml = !mismatch ? '' : `
            <div style="background:${intentional ? '#f8fafc' : '#fffbeb'};border:1px solid ${intentional ? '#e2e8f0' : '#fde68a'};border-radius:8px;padding:6px 9px;margin-bottom:8px;font-size:9.5px;color:${intentional ? '#475569' : '#92400e'};font-weight:700;">
              ${esc(intentional
                ? tx(lang,{
                    fr:`Envoi partiel : ${rowsTotal} pièces expédiées sur ${order.totalQuantity} enregistrées pour cette commande.`,
                    ar:`إرسال جزئي: ${rowsTotal} قطعة مرسلة من أصل ${order.totalQuantity} مسجّلة في هذه الطلبية.`,
                    en:`Partial shipment: ${rowsTotal} pieces sent out of ${order.totalQuantity} recorded for this order.`,
                    es:`Envío parcial: ${rowsTotal} piezas enviadas de ${order.totalQuantity} registradas en este pedido.`,
                    pt:`Remessa parcial: ${rowsTotal} peças expedidas de ${order.totalQuantity} registadas nesta encomenda.`,
                    tr:`Kısmi sevkiyat: bu siparişte kayıtlı ${order.totalQuantity} adetten ${rowsTotal} adet gönderildi.`,
                  })
                : tx(lang,{
                    fr:`Attention : le détail par couleur totalise ${rowsTotal} pièces alors que la commande en enregistre ${order.totalQuantity}. Vérifier avant expédition.`,
                    ar:`تنبيه: التفصيل حسب اللون مجموعه ${rowsTotal} قطعة بينما الطلبية مسجّلة بـ ${order.totalQuantity}. تحقّق قبل الإرسال.`,
                    en:`Warning: the per-color detail totals ${rowsTotal} pieces while the order records ${order.totalQuantity}. Check before shipping.`,
                    es:`Atención: el detalle por color suma ${rowsTotal} piezas mientras el pedido registra ${order.totalQuantity}. Verifique antes del envío.`,
                    pt:`Atenção: o detalhe por cor totaliza ${rowsTotal} peças enquanto a encomenda regista ${order.totalQuantity}. Verifique antes da expedição.`,
                    tr:`Uyarı: renk detayı ${rowsTotal} adet toplarken sipariş ${order.totalQuantity} kaydediyor. Sevkiyattan önce kontrol edin.`,
                  }))}
            </div>`;

    // Jalons : cases à cocher imprimées, l'état venant de la commande. Sur le
    // papier, la case cochée vaut engagement de ce qui a déjà été fourni.
    const milestones = buildBonEnvoiMilestones(order).filter(m => !bonEnvoiOff.has(m.key));
    const milestonesBlock = (bonEnvoiShow.milestones && milestones.length > 0) ? `
            <div class="block">
              <div class="block-title">${esc(tx(lang,{fr:'Jalons logistiques',ar:'المراحل اللوجستية',en:'Logistics milestones',es:'Hitos logísticos',pt:'Marcos logísticos',tr:'Lojistik kilometre taşları'}))}</div>
              <div class="chips">
                ${milestones.map(m => `<span class="chip">${m.done ? '&#10003;' : '&#9744;'} ${esc(m.label)}</span>`).join('')}
              </div>
            </div>` : '';

    // Matières à prévoir : saisie libre, une par ligne.
    const materialLines = bonEnvoiMaterials.split('\n').map(l => l.trim()).filter(Boolean);
    const materialsBlock = (bonEnvoiShow.materials && materialLines.length > 0) ? `
            <div class="block">
              <div class="block-title">${esc(tx(lang,{fr:'Matières / fournitures à prévoir',ar:'المواد واللوازم الواجب توفيرها',en:'Materials / supplies to provide',es:'Materias / fornituras a prever',pt:'Matérias / acessórios a prever',tr:'Sağlanacak malzemeler'}))}</div>
              <ul class="mat-list">${materialLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
            </div>` : '';

    const notesBlock = (bonEnvoiShow.notes && bonEnvoiNotes.trim()) ? `
            <div class="block notes">
              <div class="block-title" style="color:#a21caf;">${esc(tx(lang,{fr:'Notes',ar:'ملاحظات',en:'Notes',es:'Notas',pt:'Notas',tr:'Notlar'}))}</div>
              <div style="font-size:11px;color:#581c87;font-weight:600;white-space:pre-line;">${esc(bonEnvoiNotes.trim())}</div>
            </div>` : '';

    const partyLines = (p: { adresse: string; tel: string; ice: string; rc: string }) => [
      p.adresse,
      p.tel ? `${tx(lang,{fr:'Tél',ar:'الهاتف',en:'Tel',es:'Tel',pt:'Tel',tr:'Tel'})} : ${p.tel}` : '',
      [p.ice ? `ICE : ${p.ice}` : '', p.rc ? `RC : ${p.rc}` : ''].filter(Boolean).join(' · '),
    ].filter(Boolean).map(l => `<div class="party-line">${esc(l)}</div>`).join('');

    const shipDate = bonEnvoiDate || new Date().toISOString().slice(0, 10);

    printWindow.document.write(`
      <html>
        <head>
          <title>${tx(lang,{fr:"Bon d'Envoi en Sous-traitance",ar:'مذكرة إرسال للمقاولة من الباطن',en:'Subcontract Delivery Note',es:'Nota de Envío de Subcontratación',pt:'Nota de Remessa de Subcontratação',tr:'Taşeron Sevk İrsaliyesi'})} - ${order.modelName}</title>
          <style>
            /* Bon d'atelier : il doit tenir sur UNE feuille A4 — un bon à deux
               pages se signe sur la première et la seconde se perd. Tout est
               donc calibré serré, comme la facture de sous-traitance. */
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; padding: 16px; line-height: 1.35; font-size: 11px; }
            .invoice-box { max-width: 820px; margin: auto; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 12px; }
            .title { font-size: 18px; font-weight: 900; color: #1e1b4b; }
            .meta-section { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
            .box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 8px; }
            .box-title { font-size: 8px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: .04em; }
            .box-val { font-size: 12px; font-weight: 800; color: #0f172a; margin-top: 2px; }
            .party-line { font-size: 9.5px; color: #475569; font-weight: 600; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-size: 9px; color: #475569; font-weight: 800; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; }
            td { padding: 5px 8px; border-bottom: 1px solid #eef2f7; font-size: 11px; }
            .block { border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; margin-bottom: 8px; background: #fafafa; }
            .block.notes { background: #faf5ff; border-color: #f3e8ff; }
            .block-title { font-size: 8.5px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: .04em; margin-bottom: 4px; }
            .chips { display: flex; flex-wrap: wrap; gap: 6px; }
            .chip { border: 1px solid #cbd5e1; border-radius: 999px; padding: 2px 8px; font-size: 9.5px; font-weight: 700; color: #334155; }
            .mat-list { margin: 0; padding-left: 16px; font-size: 10.5px; font-weight: 600; color: #334155; }
            /* Les vignettes sont des repères d'identification, pas des
               illustrations : au-delà de cette taille elles mangent une ligne. */
            .thumbs { display: flex; gap: 10px; margin-bottom: 10px; }
            .thumb { text-align: center; font-size: 8.5px; font-weight: 700; color: #64748b; }
            .thumb img { height: 52px; width: auto; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 6px; display: block; margin-bottom: 2px; }
            .signatures { display: flex; justify-content: space-between; margin-top: 22px; }
            .sig-box { width: 220px; border-top: 1px dashed #cbd5e1; text-align: center; padding-top: 6px; font-size: 9px; color: #475569; font-weight: 800; }
            .footer { margin-top: 12px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
            @page { size: A4; margin: 10mm 10mm; }
            thead { display: table-header-group; }
            tr, .box, .block, .signatures { break-inside: avoid; page-break-inside: avoid; }
            @media print {
              body { padding: 0; font-size: 10.5px; }
              .invoice-box { max-width: none; }
              .signatures { margin-top: 16px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="invoice-box">
          <div class="header">
            <div style="display:flex;align-items:center;gap:12px;">
              ${bonEnvoiShow.logo && companyIdentity.logo ? `<img src="${esc(companyIdentity.logo)}" alt="" style="height:44px;width:auto;object-fit:contain;" />` : ''}
              <div>
                <!-- Pas d'ICE/RC ici : ils figurent dans le cartouche Expéditeur
                     juste dessous et en pied de page. -->
                <div class="title">${esc(bonEnvoiIssuer.nom || '')}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 18px; font-weight: 900; color: #4f46e5;">${esc(tx(lang,{fr:"BON D'ENVOI DE SOUS-TRAITANCE",ar:'مذكرة إرسال المقاولة من الباطن',en:'SUBCONTRACT DELIVERY NOTE',es:'NOTA DE ENVÍO DE SUBCONTRATACIÓN',pt:'NOTA DE REMESSA DE SUBCONTRATAÇÃO',tr:'TAŞERON SEVK İRSALİYESİ'}))}</div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-top: 4px;">REF: BS-${esc(order.id.slice(0, 8).toUpperCase())}</div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b;">${esc(tx(lang,{fr:"Date d'expédition",ar:'تاريخ الإرسال',en:'Shipping date',es:'Fecha de envío',pt:'Data de expedição',tr:'Sevk tarihi'}))} : ${esc(fmtDate(shipDate))}</div>
            </div>
          </div>

          <div class="meta-section">
            <div class="box">
              <div class="box-title">${esc(tx(lang,{fr:"Expéditeur (donneur d'ordre)",ar:'المرسِل (صاحب الطلب)',en:'Sender (ordering party)',es:'Expedidor (ordenante)',pt:'Expedidor (mandante)',tr:'Gönderen (sipariş veren)'}))}</div>
              <div class="box-val">${esc(bonEnvoiIssuer.nom || tx(lang,{fr:'Entreprise non renseignée',ar:'الشركة غير محدَّدة',en:'Company not set',es:'Empresa no indicada',pt:'Empresa não indicada',tr:'Şirket belirtilmedi'}))}</div>
              ${partyLines(bonEnvoiIssuer)}
            </div>
            <div class="box">
              <div class="box-title">${esc(tx(lang,{fr:'Destinataire (sous-traitant)',ar:'المرسَل إليه (المقاول من الباطن)',en:'Recipient (subcontractor)',es:'Destinatario (subcontratista)',pt:'Destinatário (subcontratado)',tr:'Alıcı (taşeron)'}))}</div>
              <div class="box-val">${esc(bonEnvoiTiers.nom || order.subcontractorName)}</div>
              ${partyLines(bonEnvoiTiers)}
            </div>
            <div class="box">
              <div class="box-title">${esc(tx(lang,{fr:'Modèle & Réf',ar:'الموديل والمرجع',en:'Model & Ref',es:'Modelo y Ref',pt:'Modelo e Ref',tr:'Model ve Referans'}))}</div>
              <div class="box-val">${esc(order.modelName || order.modelId)}</div>
              <div class="party-line">${esc(tx(lang,{fr:"Client / Donneur d'Ordre",ar:'العميل / صاحب الطلب',en:'Client / Ordering Party',es:'Cliente / Ordenante',pt:'Cliente / Mandante',tr:'Müşteri / Sipariş Veren'}))} : ${esc(order.clientName || '—')}</div>
              <div class="party-line">${esc(tx(lang,{fr:'Livraison prévue',ar:'التسليم المتوقع',en:'Expected delivery',es:'Entrega prevista',pt:'Entrega prevista',tr:'Beklenen teslimat'}))} : ${esc(fmtDate(order.deliveryDate))}</div>
            </div>
            <div class="box">
              <div class="box-title">${esc(tx(lang,{fr:"Nature de l'envoi",ar:'طبيعة الإرسالية',en:'Nature of the shipment',es:'Naturaleza del envío',pt:'Natureza da remessa',tr:'Sevkiyatın niteliği'}))}</div>
              <div class="box-val">${esc(shipmentNature)}</div>
              <div class="party-line">${esc(shipmentNatureHint)}</div>
            </div>
          </div>

          ${visualsBlock}

          <table>
            <thead>
              <tr>
                <th>${esc(tx(lang,{fr:'Couleur',ar:'اللون',en:'Color',es:'Color',pt:'Cor',tr:'Renk'}))}</th>
                ${sizeHeadHtml}
                <th style="text-align: right;">${esc(tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'}))}</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr style="background: #f8fafc; font-weight: 900; font-size: 12px; border-top: 2px solid #cbd5e1;">
                <td>${esc(totalRowLabel)}</td>
                ${sizeFootHtml}
                <td style="text-align: right; font-weight: 900; color: #4f46e5; font-size: 14px;">${rowsTotal.toLocaleString(dateLocale)} pcs</td>
              </tr>
            </tbody>
          </table>

          ${mismatchHtml}

          ${milestonesBlock}

          ${detailBlock}

          ${materialsBlock}

          ${notesBlock}

          <div class="signatures">
            <div class="sig-box">${esc(tx(lang,{fr:'Livreur / Transporteur',ar:'المسلم / الناقل',en:'Delivery Person / Carrier',es:'Repartidor / Transportista',pt:'Entregador / Transportador',tr:'Teslim Eden / Nakliyeci'}))}</div>
            <div class="sig-box">${esc(tx(lang,{fr:'Réception Sous-traitant',ar:'استلام المقاول من الباطن',en:'Subcontractor Receipt',es:'Recepción Subcontratista',pt:'Recepção Subcontratado',tr:'Taşeron Teslim Alma'}))}</div>
            <div class="sig-box">${esc(tx(lang,{fr:'Contrôle Production',ar:'مراقبة الإنتاج',en:'Production Control',es:'Control de Producción',pt:'Controlo de Produção',tr:'Üretim Kontrolü'}))}</div>
          </div>

          <div class="footer">
            ${esc([bonEnvoiIssuer.nom, bonEnvoiIssuer.ice ? `ICE : ${bonEnvoiIssuer.ice}` : '', bonEnvoiIssuer.tel].filter(Boolean).join(' · '))}
          </div>
          </div>
                  ${autoFitScript(20)}
</body>
      </html>
    `);
    printWindow.document.close();
  };

  // ======================================================================
  // C — FACTURE DE SOUS-TRAITANCE : construction des lignes
  // ======================================================================

  /** Arrondi comptable à 2 décimales. Appliqué à CHAQUE agrégat monétaire :
   *  laisser filer les flottants finit par afficher un « reste à payer » de
   *  0,004 DH que personne ne peut solder. */
  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

  const toIsoDay = (d: Date) => d.toISOString().split('T')[0];
  const addDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return toIsoDay(d);
  };

  /** Délai d'échéance déduit des conditions de paiement de la commande.
   *  Ce ne sont que des valeurs de départ : la date reste modifiable. */
  const dueDelayFromTerms = (terms?: SubcontractOrder['paymentTerms']) =>
    terms === 'APRES_LIVRAISON' ? 30 : terms === 'ECHEANCES' ? 60 : 0;

  /** Montant en toutes lettres — mention OBLIGATOIRE sur une facture au Maroc.
   *  Rendu en français et en arabe car les deux ont cours devant l'administration.
   *  La partie décimale est traitée en centimes entiers (arrondi à 2 décimales
   *  déjà fait en amont) pour ne jamais écrire « virgule cinq » au lieu de
   *  « cinquante centimes ». */
  const frenchWords = (n: number): string => {
    const u = ['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
    const t = ['','','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];
    const below100 = (v: number): string => {
      if (v < 20) return u[v];
      const d = Math.floor(v / 10), r = v % 10;
      if (d === 7 || d === 9) return `${t[d]}-${d === 7 && r === 1 ? 'et-' : ''}${u[10 + r]}`;
      if (d === 8) return r === 0 ? 'quatre-vingts' : `quatre-vingt-${u[r]}`;
      return r === 0 ? t[d] : `${t[d]}-${r === 1 ? 'et-' : ''}${u[r]}`;
    };
    const below1000 = (v: number): string => {
      const c = Math.floor(v / 100), r = v % 100;
      if (c === 0) return below100(r);
      const head = c === 1 ? 'cent' : `${u[c]}-cent`;
      return r === 0 ? `${head}${c > 1 ? 's' : ''}` : `${head}-${below100(r)}`;
    };
    if (n === 0) return 'zéro';
    const parts: string[] = [];
    const scales: [number, string, string][] = [[1e9, 'milliard', 'milliards'], [1e6, 'million', 'millions'], [1e3, 'mille', 'mille']];
    let rest = n;
    scales.forEach(([value, one, many]) => {
      const count = Math.floor(rest / value);
      if (count > 0) {
        // « mille » est invariable et ne se dit jamais « un mille ».
        parts.push(value === 1e3
          ? (count === 1 ? 'mille' : `${below1000(count)} mille`)
          : `${below1000(count)} ${count === 1 ? one : many}`);
        rest -= count * value;
      }
    });
    if (rest > 0) parts.push(below1000(rest));
    return parts.join(' ');
  };

  const arabicWords = (n: number): string => {
    const ones = ['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة'];
    const tens = ['','عشرة','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
    const hundreds = ['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];
    const below100 = (v: number): string => {
      if (v === 0) return '';
      if (v < 10) return ones[v];
      if (v === 10) return 'عشرة';
      if (v < 20) return v === 11 ? 'أحد عشر' : v === 12 ? 'اثنا عشر' : `${ones[v - 10]} عشر`;
      const d = Math.floor(v / 10), r = v % 10;
      return r === 0 ? tens[d] : `${ones[r]} و${tens[d]}`;
    };
    const below1000 = (v: number): string => {
      const c = Math.floor(v / 100), r = v % 100;
      return [hundreds[c], below100(r)].filter(Boolean).join(' و');
    };
    if (n === 0) return 'صفر';
    const parts: string[] = [];
    let rest = n;
    const million = Math.floor(rest / 1e6);
    if (million > 0) {
      parts.push(million === 1 ? 'مليون' : million === 2 ? 'مليونان' : `${below1000(million)} ملايين`);
      rest -= million * 1e6;
    }
    const thousand = Math.floor(rest / 1e3);
    if (thousand > 0) {
      parts.push(thousand === 1 ? 'ألف' : thousand === 2 ? 'ألفان' : thousand <= 10 ? `${ones[thousand]} آلاف` : `${below1000(thousand)} ألفاً`);
      rest -= thousand * 1e3;
    }
    if (rest > 0) parts.push(below1000(rest));
    return parts.join(' و');
  };

  /** Phrase complète « X dirhams et Y centimes », dans les deux langues. */
  const amountInWords = (amount: number, code: string) => {
    const safe = Math.max(0, round2(amount));
    const whole = Math.floor(safe);
    const cents = Math.round((safe - whole) * 100);
    const unitFr = code === 'MAD' ? 'dirhams' : code;
    const unitAr = code === 'MAD' ? 'درهم' : code;
    return {
      fr: `${frenchWords(whole)} ${unitFr}${cents > 0 ? ` et ${frenchWords(cents)} centimes` : ''}`,
      ar: `${arabicWords(whole)} ${unitAr}${cents > 0 ? ` و${arabicWords(cents)} سنتيم` : ''}`,
    };
  };

  /** Lignes de la facture pour une quantité facturée donnée.
   *  - Façon : quantité × tarif unitaire de la commande.
   *  - Matières : uniquement en mode Façon (le sous-traitant ne fournit pas la
   *    matière). Le besoin est RECALCULÉ à la quantité facturée via
   *    `getFaconMaterialsNeeds` plutôt que mis à l'échelle après coup : les
   *    unités indivisibles (bobine, pièce) restent ainsi correctement arrondies.
   *  - Frais : voir `expenseShare` pour la règle de prorata.
   *  Aucune valeur n'est inventée : un tarif absent vaut 0 et se voit. */
  const buildCostInvoice = (order: SubcontractOrder, billedQty: number) => {
    // Référence de comparaison : ce qui a été REÇU s'il y en a, sinon la commande.
    // C'est elle qui dit si la facturation est partielle, pas la commande seule.
    const refQty = (Number(order.qtyAccepted) || 0) > 0 ? Number(order.qtyAccepted) : order.totalQuantity;
    const qty = Math.max(1, Math.floor(billedQty) || 0);
    const isPartial = qty !== refQty;

    const unitPrice = Number(order.pricePerPiece) || 0;
    const faconTotal = qty * unitPrice;

    // Le mode EXPLICITE de la fiche de coût prime sur celui déduit des
    // fournisseurs : c'est lui qui pilote déjà le prix de revient. Les faire
    // diverger produirait une facture et un coût de revient qui ne parlent pas
    // des mêmes matières. L'inférence ne sert que de repli (modèle non lié).
    const modelMode = (models.find(m => m.id === order.modelId)?.ficheData as any)?.soustraitance;
    const isFacon = (modelMode?.active ? modelMode.mode : inferSubcontractMode(order)) === 'facon';
    const materials = isFacon
      ? getFaconMaterialsNeeds(
          { modelId: order.modelId, totalQuantity: qty },
          parseJsonSafe(order.materials_fournisseur_json, {} as Record<string, string>)
        )
      : [];
    const materialsTotal = materials.reduce((a, r) => a + r.cost, 0);

    const expenses = orderExpenses
      .map(e => ({ expense: e, applied: expenseShare(e, qty, order.totalQuantity) }))
      .filter(e => e.applied > 0);
    const expensesTotal = expenses.reduce((a, e) => a + e.applied, 0);

    // Sélection ligne à ligne. `all*` garde la liste complète pour l'affichage
    // (une ligne décochée reste visible, barrée), tandis que les champs sans
    // préfixe ne portent QUE ce qui sera réellement facturé.
    const faconOn = !costInvoiceOff.has('facon');

    // Réécritures manuelles : un libellé et/ou un montant saisis remplacent la
    // valeur calculée. `edited` permet de le signaler à l'écran.
    const applyEdit = <T extends { label: string; amount: number }>(key: string, base: T) => {
      const e = costInvoiceEdits[key];
      return {
        ...base,
        label: e?.label != null && e.label !== '' ? e.label : base.label,
        amount: e?.amount != null && Number.isFinite(e.amount) ? e.amount : base.amount,
        edited: !!e && (e.label != null || e.amount != null),
      };
    };

    const materialsView = materials.map(m => {
      const e = costInvoiceEdits[`mat-${m.id}`];
      // Une quantité corrigée doit se répercuter sur le montant : facturer 400 m
      // au prix de 483 m serait faux. Un montant explicitement saisi reste
      // prioritaire, c'est la volonté la plus récente de l'utilisateur.
      const qty = e?.qty != null && Number.isFinite(e.qty) ? e.qty : m.buyQty;
      const baseAmount = e?.qty != null && Number.isFinite(e.qty) ? qty * m.unitPrice : m.cost;
      return {
        ...m,
        qty,
        qtyEdited: e?.qty != null,
        ...applyEdit(`mat-${m.id}`, { label: m.name, amount: baseAmount }),
      };
    });
    const expensesView = expenses.map(e => ({
      ...e,
      ...applyEdit(`exp-${e.expense.id}`, { label: e.expense.label, amount: e.applied }),
    }));
    const faconView = applyEdit('facon', {
      label: `${order.modelName || order.modelId}`,
      amount: faconTotal,
    });

    const keptMaterials = materialsView.filter(m => !costInvoiceOff.has(`mat-${m.id}`));
    const keptExpenses = expensesView.filter(e => !costInvoiceOff.has(`exp-${e.expense.id}`));
    const keptMaterialsTotal = keptMaterials.reduce((a, r) => a + r.amount, 0);
    const keptExpensesTotal = keptExpenses.reduce((a, e) => a + e.amount, 0);
    const keptFaconTotal = faconOn ? faconView.amount : 0;

    // Lignes libres (transport, retouche, pénalité…) : mêmes règles que les
    // autres — décochées, elles disparaissent du total, de l'impression et de
    // l'enregistrement. Sans elles, toute prestation hors modèle obligeait à
    // détourner le libellé d'une ligne existante.
    const extrasView = costInvoiceExtras.map(e => ({
      ...e,
      amount: (Number(e.qty) || 0) * (Number(e.price) || 0),
    }));
    const keptExtras = extrasView.filter(e => !costInvoiceOff.has(`extra-${e.id}`));
    const keptExtrasTotal = keptExtras.reduce((a, e) => a + e.amount, 0);

    // ---- Pied de facture : remise → net HT → TVA → TTC → reste à payer.
    // L'ordre est celui de la réglementation : la remise se déduit AVANT la TVA
    // (sinon on paierait de la TVA sur un montant jamais facturé), et l'acompte
    // se déduit APRÈS le TTC (c'est un règlement, pas une réduction de prix).
    const totalBrut = round2(keptFaconTotal + keptMaterialsTotal + keptExpensesTotal + keptExtrasTotal);
    const discountInput = Math.max(0, Number(costInvoiceDiscount) || 0);
    const discount = Math.min(
      totalBrut,
      round2(costInvoiceDiscountMode === 'PCT' ? (totalBrut * Math.min(100, discountInput)) / 100 : discountInput)
    );
    const netHT = round2(totalBrut - discount);

    // Exonération : déduite du marché du modèle (Export) sauf choix explicite.
    const isExport = models.find(m => m.id === order.modelId)?.ficheData?.typeMarche === 'Export';
    const exonerated = costInvoiceExo ?? isExport;
    const tvaRate = exonerated ? 0 : costInvoiceTva;
    const tvaAmount = round2((netHT * tvaRate) / 100);
    const totalTTC = round2(netHT + tvaAmount);

    const acompte = Math.min(totalTTC, Math.max(0, round2(Number(costInvoiceAcompte) || 0)));
    const resteAPayer = round2(totalTTC - acompte);

    const dateFacture = costInvoiceDate || toIsoDay(new Date());
    const dueDate = costInvoiceDueDate || addDays(dateFacture, dueDelayFromTerms(order.paymentTerms));

    return {
      qty,
      isPartial,
      unitPrice,
      faconOn,
      faconView,
      allMaterials: materialsView,
      allExpenses: expensesView,
      faconTotal: keptFaconTotal,
      isFacon,
      materials: keptMaterials,
      materialsTotal: keptMaterialsTotal,
      expenses: keptExpenses,
      expensesTotal: keptExpensesTotal,
      allExtras: extrasView,
      extras: keptExtras,
      extrasTotal: keptExtrasTotal,
      /** Total HT AVANT remise — conservé sous le même nom qu'avant pour ne rien
       *  casser de ce qui l'affichait déjà. */
      total: totalBrut,
      totalBrut,
      discount,
      netHT,
      exonerated,
      tvaRate,
      tvaAmount,
      totalTTC,
      acompte,
      resteAPayer,
      dateFacture,
      dueDate,
      words: amountInWords(totalTTC, currency),
      /** Nombre de lignes volontairement exclues — sert à l'avertir clairement. */
      excludedCount:
        (faconOn ? 0 : 1) + (materialsView.length - keptMaterials.length) + (expensesView.length - keptExpenses.length),
      /** Vrai si au moins une ligne a été réécrite à la main. */
      hasEdits: faconView.edited || materialsView.some(m => m.edited) || expensesView.some(e => e.edited),
    };
  };

  /** Enregistre la facture (ce qu'on doit payer au sous-traitant) via le même
   *  système générique de facturation que le reste de l'app (ACHAT, source
   *  "sousTraitance", numérotation séquentielle attribuée par le serveur —
   *  voir saveFacture/generateNumero). Aucune table ni route dédiée : on
   *  réutilise l'existant plutôt que de dupliquer un mécanisme qui marche déjà. */
  const handleSaveCostInvoice = async (order: SubcontractOrder, inv: ReturnType<typeof buildCostInvoice>) => {
    const stProfile = subcontractorProfiles.find(p => p.name === order.subcontractorName);
    setCostInvoiceSaving(true);
    setCostInvoiceSaveError(null);
    try {
      const lignes: any[] = [
        ...(inv.faconOn ? [{
          product_id: order.modelId,
          designation: `${tx(lang,{fr:'Façon',ar:'الخياطة',en:'Making',es:'Confección',pt:'Confeção',tr:'Fason'})} — ${inv.faconView.label}`,
          quantite: inv.qty,
          prix_unitaire: inv.qty > 0 ? inv.faconTotal / inv.qty : inv.unitPrice,
          total: inv.faconTotal,
        }] : []),
        ...inv.materials.map(m => ({
          product_id: order.modelId,
          designation: `${tx(lang,{fr:'Matière',ar:'مادة',en:'Material',es:'Material',pt:'Material',tr:'Malzeme'})} — ${m.label}`,
          quantite: 1,
          prix_unitaire: m.amount,
          total: m.amount,
        })),
        ...inv.expenses.map(e => ({
          product_id: order.modelId,
          designation: `${tx(lang,{fr:'Frais',ar:'مصروف',en:'Expense',es:'Gasto',pt:'Despesa',tr:'Masraf'})} — ${e.label}`,
          quantite: 1,
          prix_unitaire: e.amount,
          total: e.amount,
        })),
      ];
      // La remise part comme LIGNE NÉGATIVE : c'est la seule façon que la somme
      // des lignes stockées redonne exactement le total HT enregistré (le
      // serveur recalcule depuis les lignes quand aucun total ne lui est fourni).
      if (inv.discount > 0) {
        lignes.push({
          product_id: order.modelId,
          designation: tx(lang,{fr:'Remise commerciale',ar:'تخفيض تجاري',en:'Commercial discount',es:'Descuento comercial',pt:'Desconto comercial',tr:'Ticari indirim'}),
          quantite: 1,
          prix_unitaire: -inv.discount,
          total: -inv.discount,
        });
      }
      const totalHT = inv.netHT;
      const totalTVA = inv.tvaAmount;
      const res = await fetch('/api/facturation/factures', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ACHAT',
          tiers_nom: costInvoiceTiers.nom || order.subcontractorName,
          // Identifiants légaux du bénéficiaire, repris de sa fiche : sans eux la
          // facture d'achat n'est pas exploitable comptablement.
          tiers_ice: costInvoiceTiers.ice || stProfile?.ice || null,
          tiers_rc: costInvoiceTiers.rc || stProfile?.rc || null,
          tiers_adresse: costInvoiceTiers.adresse || stProfile?.address || null,
          tiers_tel: costInvoiceTiers.tel || stProfile?.phone || order.subcontractorPhone || null,
          date_facture: inv.dateFacture,
          date_echeance: inv.dueDate,
          taux_tva: inv.tvaRate,
          // L'acompte déjà versé est un RÈGLEMENT : il alimente montant_paye et
          // laisse le TTC intact, sinon la facture serait sous-évaluée.
          montant_paye: inv.acompte,
          notes: [
            inv.isPartial
              ? `${tx(lang,{fr:'Facturation partielle',ar:'فوترة جزئية',en:'Partial invoicing',es:'Facturación parcial',pt:'Faturação parcial',tr:'Kısmi faturalama'})} : ${inv.qty}/${order.totalQuantity} pcs`
              : '',
            inv.exonerated
              ? tx(lang,{fr:'Exonérée de TVA (marché export)',ar:'معفاة من الضريبة على القيمة المضافة (سوق التصدير)',en:'VAT exempt (export market)',es:'Exenta de IVA (mercado de exportación)',pt:'Isenta de IVA (mercado de exportação)',tr:'KDV muaf (ihracat pazarı)'})
              : '',
            inv.acompte > 0
              ? `${tx(lang,{fr:'Acompte déjà versé',ar:'تسبيق مؤدى',en:'Advance already paid',es:'Anticipo ya pagado',pt:'Adiantamento já pago',tr:'Ödenen avans'})} : ${fmt(inv.acompte)} ${currency}`
              : '',
          ].filter(Boolean).join(' · '),
          source_module: 'SOUSTRAITANCE',
          source_id: order.id,
          lignes,
          total_ht: totalHT,
          total_tva: totalTVA,
          total_ttc: inv.totalTTC,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || tx(lang,{fr:'Échec de l\'enregistrement de la facture',ar:'فشل تسجيل الفاتورة',en:'Failed to save the invoice',es:'Error al guardar la factura',pt:'Falha ao guardar a fatura',tr:'Fatura kaydedilemedi'}));
      }
      const saved = await res.json();
      setCostInvoiceSavedNumber(saved?.numero || null);
      setInvoiceListKey(k => k + 1);
    } catch (err: any) {
      setCostInvoiceSaveError(err.message || tx(lang,{fr:'Erreur de communication',ar:'خطأ في الاتصال',en:'Communication error',es:'Error de comunicación',pt:'Erro de comunicação',tr:'İletişim hatası'}));
    } finally {
      setCostInvoiceSaving(false);
    }
  };

  /** Impression de la facture de sous-traitance — même patron que le bon
   *  d'envoi : fenêtre vierge, HTML échappé, aucun JSX. */
  const handlePrintCostInvoice = (order: SubcontractOrder, billedQty: number) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const esc = (v: unknown) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const money = (v: number) => `${esc(fmt(v))} ${esc(currency)}`;

    const inv = buildCostInvoice(order, billedQty);
    const profile = subcontractorProfiles.find(p => p.name === order.subcontractorName);

    const modelPhoto = models.find(m => m.id === order.modelId)?.image || '';
    const stPhoto = profile?.photo || '';
    // Vignettes COLLÉES aux libellés plutôt qu'en bande isolée : une photo posée
    // en haut du document n'aide pas à identifier la ligne qu'elle illustre.
    const visualsBlock = '';
    const modelThumb = costInvoiceShow.model ? inlineThumbHtml(modelPhoto, 18) : '';
    const stThumb = costInvoiceShow.subcontractor ? inlineThumbHtml(stPhoto, 18) : '';
    // Photo de la matière : reprise de sa fiche Magasin, appariée par nom
    // normalisé (casse et espaces indifférents).
    const materialPhotoInv = (name: string) => {
      const n = (v: any) => String(v ?? '').trim().toLowerCase();
      const item = magasinData.find((m: any) => n(m.nom || m.designation) === n(name));
      return (item as any)?.photo || (item as any)?.image || '';
    };

    const lineRows: string[] = [];
    // Ligne Façon décochée : elle ne doit pas apparaître sur le document imprimé,
    // sinon celui-ci contredirait le total (déjà calculé sans elle).
    // Chaque ligne porte un « type » en petites capitales au-dessus de son
    // libellé : le lecteur distingue façon / matière / frais d'un coup d'œil
    // sans avoir besoin de la couleur, ce qui compte en photocopie noir et blanc.
    const lineCell = (kind: string, label: string, note = '', thumb = '') => `
                <td class="c-desc">
                  <span class="kind">${esc(kind)}</span>
                  <span class="label">${thumb}${esc(label)}</span>
                  ${note ? `<div class="note">${note}</div>` : ''}
                </td>`;

    if (inv.faconOn) lineRows.push(`
              <tr>
                ${lineCell(tx(lang,{fr:'Façon',ar:'الخياطة',en:'Making',es:'Confección',pt:'Confeção',tr:'Fason'}), inv.faconView.label, '', modelThumb)}
                <td class="num">${esc(inv.qty.toLocaleString(dateLocale))} pcs</td>
                <td class="num">${money(inv.unitPrice)}</td>
                <td class="num strong">${money(inv.faconTotal)}</td>
              </tr>`);

    inv.materials.forEach(m => {
      lineRows.push(`
              <tr>
                ${lineCell(tx(lang,{fr:'Matière',ar:'مادة',en:'Material',es:'Material',pt:'Material',tr:'Malzeme'}), m.label, '', inlineThumbHtml(materialPhotoInv(m.label), 16))}
                <td class="num">${esc(fmt(m.buyQty))} ${esc(m.unit)}</td>
                <td class="num">${money(m.unitPrice)}</td>
                <td class="num strong">${money(m.amount)}</td>
              </tr>`);
    });

    inv.expenses.forEach(({ expense, applied, label, amount }) => {
      const scopeLabel = expense.quantity_scope == null
        ? tx(lang,{fr:'Toute la commande',ar:'الطلبية كاملة',en:'Whole order',es:'Todo el pedido',pt:'Toda a encomenda',tr:'Tüm sipariş'})
        : `${expense.quantity_scope.toLocaleString(dateLocale)} pcs`;
      const prorata = applied < expense.amount - 0.005
        ? ` — ${esc(tx(lang,{fr:'au prorata',ar:'بالتناسب',en:'pro rata',es:'a prorrata',pt:'pro rata',tr:'orantılı'}))}`
        : '';
      lineRows.push(`
              <tr>
                ${lineCell(tx(lang,{fr:'Frais',ar:'مصروف',en:'Expense',es:'Gasto',pt:'Despesa',tr:'Masraf'}), label, `${esc(scopeLabel)}${prorata}`)}
                <td class="num muted">&mdash;</td>
                <td class="num muted">&mdash;</td>
                <td class="num strong">${money(amount)}</td>
              </tr>`);
    });

    // Visuels optionnels : photo du modèle et/ou photo du sous-traitant. Ils ne
    // sont imprimés que si l'utilisateur les a cochés ET qu'ils existent.

    // Avis de facturation partielle : encadré sobre et surtout signalé par un
    // filet épais à gauche, lisible même sans la teinte ambre à l'impression N&B.
    const partialNotice = inv.isPartial ? `
          <div class="notice">
            ${esc(tx(lang,{
              fr:`Facturation partielle : ${inv.qty} pièces facturées sur ${order.totalQuantity} commandées.`,
              ar:`فوترة جزئية: ${inv.qty} قطعة مفوترة من ${order.totalQuantity} مطلوبة.`,
              en:`Partial invoicing: ${inv.qty} pieces invoiced out of ${order.totalQuantity} ordered.`,
              es:`Facturación parcial: ${inv.qty} piezas facturadas de ${order.totalQuantity} pedidas.`,
              pt:`Faturação parcial: ${inv.qty} peças faturadas de ${order.totalQuantity} encomendadas.`,
              tr:`Kısmi faturalama: sipariş edilen ${order.totalQuantity} adetten ${inv.qty} adet faturalandı.`,
            }))}
          </div>` : '';

    const issuerLines = [
      companyIdentity.adresse,
      companyIdentity.tel ? `${tx(lang,{fr:'Tél',ar:'الهاتف',en:'Tel',es:'Tel',pt:'Tel',tr:'Tel'})} : ${companyIdentity.tel}` : '',
      [companyIdentity.ice ? `ICE : ${companyIdentity.ice}` : '', companyIdentity.rc ? `RC : ${companyIdentity.rc}` : ''].filter(Boolean).join(' · '),
    ].filter(Boolean).map(l => `<div class="party-line">${esc(l)}</div>`).join('');

    const recipientLines = [
      costInvoiceTiers.adresse || profile?.address || '',
      costInvoiceTiers.tel || profile?.phone || order.subcontractorPhone || '',
      [(costInvoiceTiers.ice || profile?.ice) ? `ICE : ${costInvoiceTiers.ice || profile?.ice}` : '', (costInvoiceTiers.rc || profile?.rc) ? `RC : ${costInvoiceTiers.rc || profile?.rc}` : ''].filter(Boolean).join(' · '),
    ].filter(Boolean).map(l => `<div class="party-line">${esc(l)}</div>`).join('');

    // Le numéro définitif est attribué par le serveur à l'enregistrement. Tant
    // qu'il n'existe pas, on imprime une référence provisoire clairement
    // identifiée comme telle : une facture ne doit jamais laisser croire qu'elle
    // porte un numéro séquentiel légal alors qu'elle n'en a pas.
    const numeroLabel = costInvoiceSavedNumber
      ? `${tx(lang,{fr:'Facture n°',ar:'فاتورة رقم',en:'Invoice no.',es:'Factura n.º',pt:'Fatura n.º',tr:'Fatura no'})} ${costInvoiceSavedNumber}`
      : `${tx(lang,{fr:'Référence provisoire',ar:'مرجع مؤقت',en:'Provisional reference',es:'Referencia provisional',pt:'Referência provisória',tr:'Geçici referans'})} : FS-${order.id.slice(0, 8).toUpperCase()}`;

    const paymentTermsLabel = order.paymentTerms === 'APRES_LIVRAISON'
      ? tx(lang,{fr:'Paiement après livraison (30 jours)',ar:'الأداء بعد التسليم (30 يوماً)',en:'Payment after delivery (30 days)',es:'Pago tras la entrega (30 días)',pt:'Pagamento após entrega (30 dias)',tr:'Teslimat sonrası ödeme (30 gün)'})
      : order.paymentTerms === 'ECHEANCES'
        ? tx(lang,{fr:'Paiement échelonné (60 jours)',ar:'أداء بالتقسيط (60 يوماً)',en:'Instalment payment (60 days)',es:'Pago fraccionado (60 días)',pt:'Pagamento faseado (60 dias)',tr:'Taksitli ödeme (60 gün)'})
        : tx(lang,{fr:'Avance à la réception',ar:'تسبيق عند الاستلام',en:'Advance on receipt',es:'Anticipo a la recepción',pt:'Adiantamento na receção',tr:'Teslimde peşinat'});

    // Mentions légales minimales d'une facture marocaine : identifiants du
    // vendeur, conditions de règlement et, le cas échéant, le motif d'exonération.
    const legalLines = [
      `${tx(lang,{fr:'Conditions de paiement',ar:'شروط الأداء',en:'Payment terms',es:'Condiciones de pago',pt:'Condições de pagamento',tr:'Ödeme koşulları'})} : ${paymentTermsLabel}`,
      inv.exonerated
        ? tx(lang,{fr:'Opération exonérée de TVA (marché export) — article 92 du Code Général des Impôts.',ar:'عملية معفاة من الضريبة على القيمة المضافة (سوق التصدير) — المادة 92 من المدونة العامة للضرائب.',en:'VAT-exempt transaction (export market) — article 92 of the Moroccan General Tax Code.',es:'Operación exenta de IVA (mercado de exportación) — artículo 92 del Código General de Impuestos.',pt:'Operação isenta de IVA (mercado de exportação) — artigo 92.º do Código Geral dos Impostos.',tr:'KDV\'den muaf işlem (ihracat pazarı) — Genel Vergi Kanunu madde 92.'})
        : '',
      tx(lang,{fr:'Tout retard de paiement au-delà de la date d\'échéance peut donner lieu à des pénalités de retard conformément à la loi 32-10.',ar:'كل تأخير في الأداء بعد تاريخ الاستحقاق قد يترتب عنه غرامات تأخير طبقاً للقانون 32-10.',en:'Any payment delay beyond the due date may incur late penalties under Moroccan law 32-10.',es:'Cualquier retraso en el pago tras el vencimiento puede generar penalizaciones según la ley 32-10.',pt:'Qualquer atraso no pagamento após o vencimento pode gerar penalidades nos termos da lei 32-10.',tr:'Vade tarihinden sonraki gecikmeler 32-10 sayılı kanun uyarınca gecikme cezasına tabi olabilir.'}),
    ].filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>${esc(tx(lang,{fr:'Facture Sous-traitance',ar:'فاتورة المقاولة من الباطن',en:'Subcontract Invoice',es:'Factura de Subcontratación',pt:'Fatura de Subcontratação',tr:'Taşeron Faturası'}))} - ${esc(order.modelName || order.modelId)}</title>
          <style>
            /* Facture d'atelier : elle doit tenir sur UNE feuille A4. Tout est
               donc calibré serré — une facture qui déborde sur une seconde page
               oblige à agrafer, et la page 2 finit par se perdre.

               Parti pris graphique : document comptable, pas plaquette. Aucun
               aplat de couleur décoratif, la hiérarchie repose sur la graisse,
               la casse et l'épaisseur des filets — donc elle survit intacte à
               une photocopie noir et blanc. Les seuls aplats restants (bandeau
               TOTAL TTC, en-tête de tableau) sont des gris/noirs neutres. */
            * { box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #16202e; padding: 16px; line-height: 1.35; font-size: 11px; }
            .invoice-box { max-width: 820px; margin: auto; }

            /* Chiffres : chasse fixe pour que les colonnes de montants s'alignent
               à la virgule près, comme sur une facture d'imprimeur. */
            .num, .amount { text-align: right; font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; white-space: nowrap; }

            /* --- En-tête --- */
            .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 1.5px solid #16202e; padding-bottom: 8px; }
            .header-rule { border-bottom: 0.5px solid #16202e; margin-bottom: 12px; padding-top: 1.5px; }
            .logo { font-size: 17px; font-weight: 800; letter-spacing: -.01em; color: #16202e; }
            .doc-title { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: .10em; color: #16202e; }
            .doc-meta { margin-top: 5px; font-size: 10px; color: #16202e; }
            .doc-meta div { margin-top: 1px; }
            .doc-meta .k { color: #667085; }
            .doc-meta .v { font-weight: 700; }

            /* --- Émetteur / bénéficiaire : deux colonnes séparées par un filet
                   discret plutôt que deux cartouches grises qui alourdissent. --- */
            .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-bottom: 12px; }
            .party { padding: 0 14px; }
            .party:first-child { padding-left: 0; }
            .party:last-child { border-left: 0.5px solid #ccd3dc; }
            .party-title { font-size: 7.5px; text-transform: uppercase; color: #667085; font-weight: 700; letter-spacing: .12em; }
            .party-name { font-size: 12px; font-weight: 800; color: #16202e; margin-top: 3px; }
            .party-line { font-size: 10px; color: #4a5568; margin-top: 2px; }

            /* --- Tableau des lignes --- */
            table { width: 100%; border-collapse: collapse; }
            .lines { margin-bottom: 10px; }
            .lines th { padding: 5px 8px; text-align: left; font-size: 8px; color: #16202e; font-weight: 700; text-transform: uppercase; letter-spacing: .09em;
                        border-top: 0.75px solid #16202e; border-bottom: 0.75px solid #16202e; }
            .lines th.num { text-align: right; }
            .lines td { padding: 5px 8px; border-bottom: 0.5px solid #e3e8ee; vertical-align: top; }
            .lines tr:last-child td { border-bottom: 0.75px solid #16202e; }
            .lines .c-desc { padding-left: 0; }
            .lines td.num:last-child, .lines th.num:last-child { padding-right: 0; }
            .kind { font-size: 7.5px; text-transform: uppercase; letter-spacing: .10em; color: #667085; font-weight: 700; display: block; }
            .label { font-weight: 600; color: #16202e; }
            .note { font-size: 9px; color: #667085; margin-top: 1px; }
            .strong { font-weight: 700; }
            .muted { color: #98a2b3; }

            /* --- Pied : mentions à gauche, totaux à droite. Le lecteur cherche
                   toujours le montant en bas à droite : on l'y met. --- */
            .summary { display: grid; grid-template-columns: 1fr 300px; gap: 20px; align-items: start; }
            .total-table { width: 100%; }
            .total-table td { padding: 3px 0; border: none; font-size: 10.5px; }
            .total-table td:first-child { color: #4a5568; }
            .total-table td:last-child { font-weight: 700; }
            .sub-rule td { border-top: 0.5px solid #ccd3dc !important; }
            /* TOTAL TTC : bandeau plein noir. C'est l'information que l'œil doit
               atteindre en premier, et un aplat reste dominant en N&B. */
            .total-row td { background: #16202e; color: #ffffff; font-weight: 800; font-size: 12.5px; padding: 6px 8px; letter-spacing: .02em; }
            .total-row td:first-child { color: #ffffff; text-transform: uppercase; font-size: 10px; letter-spacing: .09em; }
            .balance-row td { border-top: 0.75px solid #16202e !important; font-weight: 800; font-size: 11.5px; padding-top: 5px; }
            .balance-row td:first-child { color: #16202e; text-transform: uppercase; font-size: 9px; letter-spacing: .09em; }

            .words { border-left: 2px solid #16202e; padding: 2px 0 2px 9px; }
            .words-title { font-size: 7.5px; text-transform: uppercase; color: #667085; font-weight: 700; letter-spacing: .10em; }
            .words-fr { font-weight: 700; margin-top: 2px; font-size: 10.5px; }
            .words-ar { direction: rtl; font-size: 10.5px; font-weight: 700; margin-top: 1px; }

            .notice { border-left: 2.5px solid #16202e; background: #f4f6f8; padding: 6px 10px; margin-bottom: 10px; font-size: 10px; font-weight: 700; }

            .legal { font-size: 8.5px; color: #4a5568; line-height: 1.5; margin-top: 12px; padding: 0; }
            .legal ul { margin: 3px 0 0; padding-left: 12px; }
            .legal li { margin-top: 1px; }
            .legal-title { font-size: 7.5px; text-transform: uppercase; color: #667085; font-weight: 700; letter-spacing: .10em; }

            .signatures { display: flex; justify-content: space-between; gap: 24px; margin-top: 26px; }
            .sig-box { width: 210px; border-top: 0.5px solid #16202e; text-align: center; padding-top: 4px; font-size: 8.5px; color: #4a5568; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; }
            .footer { margin-top: 12px; text-align: center; font-size: 8.5px; color: #667085; border-top: 0.5px solid #e3e8ee; padding-top: 6px; }

            /* Les vignettes sont des repères d'identification, pas des
               illustrations : au-delà de cette taille elles mangent une ligne
               du tableau, ce qui coûte une page. */
            .thumbs { display: flex; gap: 10px; margin-bottom: 8px; }
            .thumb img { height: 40px; width: 40px; object-fit: cover; border: 0.5px solid #ccd3dc; }
            .thumb div { font-size: 7.5px; color: #667085; margin-top: 2px; text-align: center; max-width: 56px; }
            /* Papier A4 : marges typographiques raisonnables, en-tête de tableau
               répété sur chaque page et lignes jamais coupées en deux — sans quoi
               une facture de 30 lignes devient illisible à l'impression. */
            @page { size: A4; margin: 10mm 10mm; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            tr, .party, .words, .signatures, .summary { break-inside: avoid; page-break-inside: avoid; }
            @media print {
              body { padding: 0; font-size: 10.5px; }
              .invoice-box { max-width: none; }
              /* Rien ne doit provoquer de saut : la facture tient sur une page. */
              .signatures { margin-top: 18px; }
              /* Le bandeau TOTAL TTC perd tout son sens si le navigateur
                 supprime les aplats : on les force à l'impression. */
              .total-row td, .notice { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="invoice-box">
            <div class="header">
              <div>
                <div style="display:flex;align-items:center;gap:12px;">
                  ${costInvoiceShow.logo && companyIdentity.logo ? `<img src="${esc(companyIdentity.logo)}" alt="" style="height:44px;width:auto;object-fit:contain;" />` : ''}
                  <div>
                    <!-- Ni vignette de logo (l'image ci-dessus EST le logo), ni
                         ICE/RC : ils figurent déjà dans le cartouche Émetteur et
                         en pied de page. Trois fois la même donnée sur une facture
                         donne l'impression d'un document mal fait. -->
                    <div class="logo">${esc(companyIdentity.nom || '')}</div>
                  </div>
                </div>
              </div>
              <div style="text-align: right;">
                <div class="doc-title">${esc(tx(lang,{fr:'FACTURE SOUS-TRAITANCE',ar:'فاتورة المقاولة من الباطن',en:'SUBCONTRACT INVOICE',es:'FACTURA DE SUBCONTRATACIÓN',pt:'FATURA DE SUBCONTRATAÇÃO',tr:'TAŞERON FATURASI'}))}</div>
                <div class="doc-meta">
                  <div class="v">${esc(numeroLabel)}</div>
                  <div><span class="k">${esc(tx(lang,{fr:'Date',ar:'التاريخ',en:'Date',es:'Fecha',pt:'Data',tr:'Tarih'}))} :</span> <span class="v">${esc(fmtDate(inv.dateFacture))}</span></div>
                  <div><span class="k">${esc(tx(lang,{fr:'Échéance',ar:'تاريخ الاستحقاق',en:'Due date',es:'Vencimiento',pt:'Vencimento',tr:'Vade'}))} :</span> <span class="v">${esc(fmtDate(inv.dueDate))}</span></div>
                </div>
              </div>
            </div>
            <!-- Double filet : la ligne fine sous le trait épais donne au
                 document sa signature « papier à en-tête » sans coûter de place. -->
            <div class="header-rule"></div>

            <div class="parties">
              <div class="party">
                <div class="party-title">${esc(tx(lang,{fr:'Émetteur',ar:'المصدر',en:'Issuer',es:'Emisor',pt:'Emitente',tr:'Düzenleyen'}))}</div>
                <div class="party-name">${esc(companyIdentity.nom || tx(lang,{fr:'Entreprise non renseignée',ar:'الشركة غير محدَّدة',en:'Company not set',es:'Empresa no indicada',pt:'Empresa não indicada',tr:'Şirket belirtilmedi'}))}</div>
                ${issuerLines}
              </div>
              <div class="party">
                <div class="party-title">${esc(tx(lang,{fr:'Sous-traitant (bénéficiaire)',ar:'المقاول من الباطن (المستفيد)',en:'Subcontractor (payee)',es:'Subcontratista (beneficiario)',pt:'Subcontratado (beneficiário)',tr:'Taşeron (alacaklı)'}))}</div>
                <div class="party-name">${stThumb}${esc(costInvoiceTiers.nom || order.subcontractorName)}</div>
                ${recipientLines}
              </div>
            </div>

            ${visualsBlock}

            ${partialNotice}

            <table class="lines">
              <thead>
                <tr>
                  <th>${esc(tx(lang,{fr:'Désignation',ar:'البيان',en:'Description',es:'Designación',pt:'Designação',tr:'Açıklama'}))}</th>
                  <th class="num">${esc(tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'}))}</th>
                  <th class="num">${esc(tx(lang,{fr:'Prix Unitaire',ar:'السعر الوحدة',en:'Unit Price',es:'Precio Unitario',pt:'Preço Unitário',tr:'Birim Fiyat'}))}</th>
                  <th class="num">${esc(tx(lang,{fr:'Total',ar:'المجموع',en:'Total',es:'Total',pt:'Total',tr:'Toplam'}))}</th>
                </tr>
              </thead>
              <tbody>
                ${lineRows.join('')}
              </tbody>
            </table>

            <!-- Deux colonnes : montant en toutes lettres à gauche (obligation
                 marocaine) et cascade des totaux à droite, là où l'œil la cherche. -->
            <div class="summary">
              <div>
                <div class="words">
                  <div class="words-title">${esc(tx(lang,{fr:'Arrêtée la présente facture à la somme de',ar:'حُررت هذه الفاتورة بمبلغ',en:'This invoice is settled at the sum of',es:'La presente factura asciende a la suma de',pt:'A presente fatura ascende à quantia de',tr:'İşbu fatura şu tutar üzerinden düzenlenmiştir'}))}</div>
                  <div class="words-fr">${esc(inv.words.fr)}</div>
                  <div class="words-ar">${esc(inv.words.ar)}</div>
                </div>
              </div>

              <table class="total-table">
                <tr>
                  <td>${esc(tx(lang,{fr:'Façon',ar:'الخياطة',en:'Making',es:'Confección',pt:'Confeção',tr:'Fason'}))}</td>
                  <td class="num">${money(inv.faconTotal)}</td>
                </tr>
                ${inv.isFacon ? `
                <tr>
                  <td>${esc(tx(lang,{fr:'Matières',ar:'المواد',en:'Materials',es:'Materiales',pt:'Materiais',tr:'Malzemeler'}))}</td>
                  <td class="num">${money(inv.materialsTotal)}</td>
                </tr>` : ''}
                <tr>
                  <td>${esc(tx(lang,{fr:'Frais additionnels',ar:'مصاريف إضافية',en:'Additional expenses',es:'Gastos adicionales',pt:'Despesas adicionais',tr:'Ek masraflar'}))}</td>
                  <td class="num">${money(inv.expensesTotal)}</td>
                </tr>
                <tr class="sub-rule">
                  <td>${esc(tx(lang,{fr:'Total HT brut',ar:'المجموع دون احتساب الضريبة',en:'Gross net-of-tax total',es:'Total sin IVA bruto',pt:'Total sem IVA bruto',tr:'Brüt KDV hariç toplam'}))}</td>
                  <td class="num">${money(inv.totalBrut)}</td>
                </tr>
                ${inv.discount > 0 ? `
                <tr>
                  <td>${esc(tx(lang,{fr:'Remise',ar:'التخفيض',en:'Discount',es:'Descuento',pt:'Desconto',tr:'İndirim'}))}</td>
                  <td class="num">&minus; ${money(inv.discount)}</td>
                </tr>
                <tr class="sub-rule">
                  <td>${esc(tx(lang,{fr:'Net HT',ar:'الصافي دون الضريبة',en:'Net excl. tax',es:'Neto sin IVA',pt:'Líquido sem IVA',tr:'Net KDV hariç'}))}</td>
                  <td class="num">${money(inv.netHT)}</td>
                </tr>` : ''}
                <tr>
                  <td>${esc(tx(lang,{fr:'TVA',ar:'الضريبة على القيمة المضافة',en:'VAT',es:'IVA',pt:'IVA',tr:'KDV'}))} ${esc(inv.tvaRate)}%${inv.exonerated ? ` (${esc(tx(lang,{fr:'exonéré',ar:'معفى',en:'exempt',es:'exento',pt:'isento',tr:'muaf'}))})` : ''}</td>
                  <td class="num">${money(inv.tvaAmount)}</td>
                </tr>
                <tr class="total-row">
                  <td>${esc(tx(lang,{fr:'TOTAL TTC',ar:'المجموع مع الضريبة',en:'TOTAL INCL. TAX',es:'TOTAL CON IVA',pt:'TOTAL COM IVA',tr:'TOPLAM (KDV DAHİL)'}))}</td>
                  <td class="num">${money(inv.totalTTC)}</td>
                </tr>
                ${inv.acompte > 0 ? `
                <tr>
                  <td>${esc(tx(lang,{fr:'Acompte déjà versé',ar:'تسبيق مؤدى',en:'Advance already paid',es:'Anticipo ya pagado',pt:'Adiantamento já pago',tr:'Ödenmiş avans'}))}</td>
                  <td class="num">&minus; ${money(inv.acompte)}</td>
                </tr>
                <tr class="balance-row">
                  <td>${esc(tx(lang,{fr:'Reste à payer',ar:'الباقي للأداء',en:'Balance due',es:'Resto a pagar',pt:'Restante a pagar',tr:'Kalan borç'}))}</td>
                  <td class="num">${money(inv.resteAPayer)}</td>
                </tr>` : ''}
              </table>
            </div>

            <div class="legal">
              <div class="legal-title">${esc(tx(lang,{fr:'Mentions légales',ar:'البيانات القانونية',en:'Legal notices',es:'Menciones legales',pt:'Menções legais',tr:'Yasal bilgiler'}))}</div>
              <ul>${legalLines}</ul>
            </div>

            <div class="signatures">
              <div class="sig-box">${esc(tx(lang,{fr:'Atelier donneur d\'ordre',ar:'الورشة صاحبة الطلب',en:'Ordering workshop',es:'Taller ordenante',pt:'Oficina mandante',tr:'Sipariş veren atölye'}))}</div>
              <div class="sig-box">${esc(tx(lang,{fr:'Sous-traitant',ar:'المقاول من الباطن',en:'Subcontractor',es:'Subcontratista',pt:'Subcontratado',tr:'Taşeron'}))}</div>
            </div>

            <div class="footer">
              <div style="font-weight:700;color:#16202e;margin-bottom:3px;">${esc([companyIdentity.nom, companyIdentity.ice ? `ICE : ${companyIdentity.ice}` : '', companyIdentity.rc ? `RC : ${companyIdentity.rc}` : '', companyIdentity.tel].filter(Boolean).join(' · '))}</div>
              ${esc(tx(lang,{fr:'Document généré électroniquement et valable sans signature.',ar:'مستند تم إنشاؤه إلكترونياً وصالح بدون توقيع.',en:'Electronically generated document valid without signature.',es:'Documento generado electrónicamente y válido sin firma.',pt:'Documento gerado eletronicamente e válido sem assinatura.',tr:'Elektronik olarak oluşturulmuş, imzasız geçerli belge.'}))}
            </div>
          </div>
                  ${autoFitScript(20)}
</body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-3.5 lg:space-y-6 p-3 lg:p-6 bg-slate-50 dark:bg-dk-bg text-slate-800 dark:text-dk-text relative font-sans animate-fade-in w-full h-full">
      
      {/* Header Banner - Compact and White - Hidden on Mobile/Tablet */}
      <div className="hidden lg:block relative overflow-hidden rounded-2xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/60 p-3.5 lg:p-4 shadow-sm dark:shadow-none text-slate-800 dark:text-dk-text">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <span className="text-[10px] font-black text-indigo-600 dark:text-dk-accent uppercase tracking-widest block">{tx(lang,{fr:'Plateforme Industrielle',ar:'المنصة الصناعية',en:'Industrial Platform',es:'Plataforma Industrial',pt:'Plataforma Industrial',tr:'Endüstriyel Platform'})}</span>
            <h1 className="text-lg lg:text-xl font-black tracking-tight text-slate-900 dark:text-dk-text">
              {tx(lang,{fr:'Sous-traitance & Monawla',ar:'المقاولة من الباطن ومناولة',en:'Subcontracting & Monawla',es:'Subcontratación & Monawla',pt:'Subcontratação & Monawla',tr:'Taşeronluk & Monawla'})}
            </h1>
          </div>
          {activeTab === 'orders' && (
            <button
              onClick={() => setIsChoiceModalOpen(true)}
              className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent/90 hover:scale-[1.01] active:scale-[0.99] text-white px-4 py-2 rounded-xl transition-all shadow-sm dark:shadow-none flex items-center justify-center gap-2 font-bold w-full sm:w-auto text-xs shrink-0 border border-indigo-600 dark:border-dk-accent"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              <span>{tx(lang,{fr:'Nouvelle Commande',ar:'أمر شراء جديد',en:'New Order',es:'Nuevo Pedido',pt:'Nova Encomenda',tr:'Yeni Sipariş'})}</span>
            </button>
          )}
        </div>
      </div>

      {/* Modern Pill-Style Tabs Bar - Compact */}
      <div className="flex bg-white dark:bg-dk-surface p-0.5 rounded-xl border border-slate-200 dark:border-dk-border/60 overflow-x-auto gap-0.5 shadow-sm dark:shadow-none max-w-max scrollbar-none shrink-0">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-2.5 lg:px-3 py-1.5 rounded-lg font-bold text-[10px] lg:text-xs transition-all flex items-center gap-1 lg:gap-1.5 whitespace-nowrap ${activeTab === 'orders' ? 'bg-indigo-600 dark:bg-dk-accent text-white shadow-sm dark:shadow-none' : 'text-slate-500 dark:text-dk-muted hover:text-slate-800 hover:bg-slate-50 dark:hover:bg-dk-elevated'}`}
        >
          <Package className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
          <span>{tx(lang,{fr:'Commandes',ar:'الطلبيات',en:'Orders',es:'Pedidos',pt:'Encomendas',tr:'Siparişler'})}</span>
        </button>
        <button
          onClick={() => setActiveTab('subcontractors')}
          className={`px-2.5 lg:px-3 py-1.5 rounded-lg font-bold text-[10px] lg:text-xs transition-all flex items-center gap-1 lg:gap-1.5 whitespace-nowrap ${activeTab === 'subcontractors' ? 'bg-indigo-600 dark:bg-dk-accent text-white shadow-sm dark:shadow-none' : 'text-slate-500 dark:text-dk-muted hover:text-slate-800 hover:bg-slate-50 dark:hover:bg-dk-elevated'}`}
        >
          <Users className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
          <span>{tx(lang,{fr:'Sous-traitants',ar:'المقاولون من الباطن',en:'Subcontractors',es:'Subcontratistas',pt:'Subcontratados',tr:'Taşeronlar'})}</span>
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-2.5 lg:px-3 py-1.5 rounded-lg font-bold text-[10px] lg:text-xs transition-all flex items-center gap-1 lg:gap-1.5 whitespace-nowrap ${activeTab === 'stock' ? 'bg-indigo-600 dark:bg-dk-accent text-white shadow-sm dark:shadow-none' : 'text-slate-500 dark:text-dk-muted hover:text-slate-800 hover:bg-slate-50 dark:hover:bg-dk-elevated'}`}
        >
          <Coins className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
          <span>{tx(lang,{fr:'Stock & Ventes',ar:'المخزون والمبيعات',en:'Stock & Sales',es:'Stock & Ventas',pt:'Stock & Vendas',tr:'Stok & Satışlar'})}</span>
        </button>
        <button
          onClick={() => setActiveTab('clients')}
          className={`px-2.5 lg:px-3 py-1.5 rounded-lg font-bold text-[10px] lg:text-xs transition-all flex items-center gap-1 lg:gap-1.5 whitespace-nowrap ${activeTab === 'clients' ? 'bg-indigo-600 dark:bg-dk-accent text-white shadow-sm dark:shadow-none' : 'text-slate-500 dark:text-dk-muted hover:text-slate-800 hover:bg-slate-50 dark:hover:bg-dk-elevated'}`}
        >
          <Users className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
          <span>{tx(lang,{fr:'Clients',ar:'الزبناء',en:'Clients',es:'Clientes',pt:'Clientes',tr:'Müşteriler'})}</span>
        </button>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 text-rose-800 dark:text-rose-400 p-3 lg:p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-4 h-4 lg:w-5 lg:h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <span className="text-xs lg:text-sm font-medium">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border/60 shadow-sm dark:shadow-none gap-3">
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
                <div className="flex-1 min-w-[110px] lg:min-w-0 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/50 p-2 lg:p-2.5 rounded-lg lg:rounded-xl shadow-sm dark:shadow-none flex items-center gap-2 lg:gap-2.5 hover:shadow-md dark:hover:shadow-none transition-all shrink-0">
                  <div className="p-1.5 lg:p-2 bg-indigo-50 dark:bg-dk-elevated text-indigo-600 dark:text-dk-accent rounded-md lg:rounded-lg shrink-0">
                    <Truck className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  </div>
                  <div>
                    <span className="text-[8px] lg:text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider block">{tx(lang,{fr:'Commandes Actives',ar:'الطلبيات النشطة',en:'Active Orders',es:'Pedidos Activos',pt:'Encomendas Ativas',tr:'Aktif Siparişler'})}</span>
                    <span className="text-xs lg:text-sm font-extrabold text-slate-800 dark:text-dk-text tracking-tight block leading-none mt-0.5">{stats.activeOrdersCount}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-[110px] lg:min-w-0 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/50 p-2 lg:p-2.5 rounded-lg lg:rounded-xl shadow-sm dark:shadow-none flex items-center gap-2 lg:gap-2.5 hover:shadow-md dark:hover:shadow-none transition-all shrink-0">
                  <div className="p-1.5 lg:p-2 bg-indigo-50 dark:bg-dk-elevated text-indigo-600 dark:text-dk-accent rounded-md lg:rounded-lg shrink-0">
                    <Package className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  </div>
                  <div>
                    <span className="text-[8px] lg:text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider block">{tx(lang,{fr:'Total Commandé',ar:'إجمالي المطلوب',en:'Total Ordered',es:'Total Pedido',pt:'Total Encomendado',tr:'Toplam Sipariş Edilen'})}</span>
                    <span className="text-xs lg:text-sm font-extrabold text-indigo-600 dark:text-dk-accent tracking-tight block leading-none mt-0.5" dir="ltr">{stats.totalQty.toLocaleString()} <span className="text-[9px] lg:text-[10px] font-semibold text-slate-400 dark:text-dk-muted">pcs</span></span>
                  </div>
                </div>
                <div className="flex-1 min-w-[110px] lg:min-w-0 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/50 p-2 lg:p-2.5 rounded-lg lg:rounded-xl shadow-sm dark:shadow-none flex items-center gap-2 lg:gap-2.5 hover:shadow-md dark:hover:shadow-none transition-all shrink-0">
                  <div className="p-1.5 lg:p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-md lg:rounded-lg shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  </div>
                  <div>
                    <span className="text-[8px] lg:text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider block">{tx(lang,{fr:'Qualité Moyenne',ar:'متوسط الجودة',en:'Average Quality',es:'Calidad Promedio',pt:'Qualidade Média',tr:'Ortalama Kalite'})}</span>
                    <span className="text-xs lg:text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight block leading-none mt-0.5">{stats.avgQualityRate}%</span>
                  </div>
                </div>
                <div className="flex-1 min-w-[110px] lg:min-w-0 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/50 p-2 lg:p-2.5 rounded-lg lg:rounded-xl shadow-sm dark:shadow-none flex items-center gap-2 lg:gap-2.5 hover:shadow-md dark:hover:shadow-none transition-all shrink-0">
                  <div className="p-1.5 lg:p-2 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-md lg:rounded-lg shrink-0">
                    <Clock className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  </div>
                  <div>
                    <span className="text-[8px] lg:text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider block">{tx(lang,{fr:'Reste à Livrer',ar:'المتبقي للتسليم',en:'Remaining to Deliver',es:'Pendiente de Entrega',pt:'Restante para Entregar',tr:'Teslim Edilecek Kalan'})}</span>
                    <span className="text-xs lg:text-sm font-extrabold text-amber-600 dark:text-amber-400 tracking-tight block leading-none mt-0.5" dir="ltr">{stats.remainingQty.toLocaleString()} <span className="text-[9px] lg:text-[10px] font-semibold text-slate-400 dark:text-dk-muted">pcs</span></span>
                  </div>
                </div>
              </div>

              {/* Clean Filters Toolbar */}
              <div className="bg-white dark:bg-dk-surface rounded-xl p-2 lg:p-3 border border-slate-200 dark:border-dk-border/60 shadow-sm dark:shadow-none flex flex-col gap-2.5 w-full shrink-0">
                {/* Search input + Mobile filter toggle */}
                <div className="flex gap-2 w-full">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={tx(lang,{fr:'Rechercher sous-traitant, modèle...',ar:'بحث عن مقاول من الباطن، موديل...',en:'Search subcontractor, model...',es:'Buscar subcontratista, modelo...',pt:'Pesquisar subcontratado, modelo...',tr:'Taşeron, model ara...'})}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 border border-slate-200 dark:border-dk-border rounded-xl text-[11px] lg:text-xs focus:outline-none focus:border-indigo-500 dark:focus:border-dk-accent w-full bg-slate-50 dark:bg-dk-surface/50 text-slate-800 dark:text-dk-text placeholder:text-slate-400"
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
                <div className={`${showMobileFilters ? 'flex' : 'hidden'} lg:flex flex-wrap items-center gap-2 w-full lg:justify-end border-t border-slate-200 dark:border-dk-border pt-2 lg:border-t-0 lg:pt-0`}>
                  {/* Group Filter */}
                  <select
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    className="text-[11px] lg:text-xs font-bold text-slate-700 dark:text-dk-text-soft bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg p-1.5 outline-none focus:border-indigo-500 dark:focus:border-dk-accent hover:bg-slate-100 dark:hover:bg-dk-elevated flex-1 sm:flex-initial"
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
                    className="text-[11px] lg:text-xs font-bold text-slate-700 dark:text-dk-text-soft bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg p-1.5 outline-none focus:border-indigo-500 dark:focus:border-dk-accent hover:bg-slate-100 dark:hover:bg-dk-elevated flex-1 sm:flex-initial"
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
                <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border/60 p-12 lg:p-16 text-center text-slate-400 dark:text-dk-muted shadow-sm dark:shadow-none">
                  <Package className="w-10 h-10 lg:w-12 lg:h-12 mx-auto mb-3 opacity-25 text-slate-300 dark:text-dk-muted" />
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
                    const controlledQty = qtyAcc + qtyRep + qtyRej;
                    const overCounted = controlledQty > order.totalQuantity;
                    const overflowLabel = tx(lang,{
                      fr:`Incohérence : ${controlledQty} pièces contrôlées pour ${order.totalQuantity} commandées.`,
                      ar:`تناقض: ${controlledQty} قطعة مراقَبة مقابل ${order.totalQuantity} مطلوبة.`,
                      en:`Inconsistency: ${controlledQty} inspected pieces for ${order.totalQuantity} ordered.`,
                      es:`Incoherencia: ${controlledQty} piezas controladas para ${order.totalQuantity} pedidas.`,
                      pt:`Incoerência: ${controlledQty} peças controladas para ${order.totalQuantity} encomendadas.`,
                      tr:`Tutarsızlık: ${order.totalQuantity} sipariş için ${controlledQty} kontrol edilen parça.`,
                    });
                    const labelAccepted = tx(lang,{fr:'Acceptées',ar:'مقبولة',en:'Accepted',es:'Aceptadas',pt:'Aceites',tr:'Kabul Edilen'});
                    const labelRework = tx(lang,{fr:'À retoucher',ar:'قيد التعديل',en:'To rework',es:'Por retocar',pt:'Por retocar',tr:'Rötus yapılacak'});
                    const labelRejected = tx(lang,{fr:'Rejetées',ar:'مرفوضة',en:'Rejected',es:'Rechazadas',pt:'Rejeitadas',tr:'Reddedilen'});

                    const matchedModel = models.find(m => m.id === order.modelId);
                    const orderProfile = subcontractorProfiles.find(p => p.name === order.subcontractorName);

                    return (
                      <div 
                        key={order.id}
                        className="bg-white dark:bg-dk-surface rounded-3xl border border-slate-200 dark:border-dk-border/60 shadow-sm dark:shadow-none hover:shadow-md dark:hover:shadow-none hover:border-slate-300 transition-all overflow-hidden flex flex-col justify-between group"
                      >
                        <div className="p-4 lg:p-5 space-y-3.5">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[9px] font-black text-indigo-600 dark:text-dk-accent uppercase tracking-widest block">{tx(lang,{fr:'Client:',ar:'العميل:',en:'Client:',es:'Cliente:',pt:'Cliente:',tr:'Müşteri:'})} {order.clientName || 'N/A'}</span>
                              <h3
                                onClick={() => { if (onLoadModel && matchedModel) onLoadModel(matchedModel); }}
                                className={`font-bold text-slate-800 dark:text-dk-text text-sm mt-0.5 line-clamp-1 ${matchedModel ? 'hover:text-indigo-600 dark:hover:text-dk-accent hover:underline cursor-pointer' : ''}`}
                                title={matchedModel ? tx(lang,{fr:"Ouvrir dans l'ingénierie",ar:'فتح في الهندسة الفنية',en:'Open in engineering',es:'Abrir en ingeniería',pt:'Abrir na engenharia',tr:'Mühendislikte aç'}) : undefined}
                              >
                                {order.modelName}
                              </h3>
                              {readCoupeLocation(order) === 'INTERNAL' && (() => {
                                const coupeStatus = matchedModel?.ordreCoupe?.status;
                                const isValidated = coupeStatus === 'VALIDE';
                                const isInProgress = coupeStatus === 'EN_COURS';
                                return (
                                  <span className={`inline-flex items-center gap-1 mt-1 text-[8px] font-bold uppercase tracking-wide ${
                                    isValidated ? 'text-emerald-600 dark:text-emerald-400' : isInProgress ? 'text-amber-600 dark:text-amber-400' : 'text-amber-600 dark:text-amber-400'
                                  }`}>
                                    <Scissors className="w-2.5 h-2.5" />
                                    {isValidated
                                      ? tx(lang,{fr:'Coupe confirmée',ar:'القص تأكّد',en:'Cutting confirmed',es:'Corte confirmado',pt:'Corte confirmado',tr:'Kesim onaylandı'})
                                      : isInProgress
                                      ? tx(lang,{fr:'Coupe en cours',ar:'القص فالطريق',en:'Cutting in progress',es:'Corte en curso',pt:'Corte em curso',tr:'Kesim devam ediyor'})
                                      : tx(lang,{fr:'Coupe non lancée',ar:'القص ماشي تلقا',en:'Cutting not started',es:'Corte no iniciado',pt:'Corte não iniciado',tr:'Kesim başlamadı'})}
                                  </span>
                                );
                              })()}
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              order.status === 'COMPLETED' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' :
                              order.status === 'LIVRE_PARTIEL' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50' :
                              order.status === 'IN_COUTURE' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50' :
                              order.status === 'IN_COUPE' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50' :
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
                              title={matchedModel ? tx(lang,{fr:"Ouvrir dans l'ingénierie",ar:'فتح في الهندسة الفنية',en:'Open in engineering',es:'Abrir en ingeniería',pt:'Abrir na engenharia',tr:'Mühendislikte aç'}) : undefined}
                            >
                              {matchedModel?.image ? (
                                <img src={matchedModel.image} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Package className="w-5 h-5 text-slate-400 dark:text-dk-muted" />
                              )}
                            </div>
                            <div className="space-y-0.5 text-[11px] flex-1">
                              <p className="font-bold text-slate-800 dark:text-dk-text leading-none flex items-center gap-1.5">
                                {orderProfile?.photo ? (
                                  <img src={orderProfile.photo} alt="" className="w-4 h-4 rounded-full object-cover shrink-0 border border-slate-200 dark:border-dk-border" />
                                ) : (
                                  <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0" />
                                )}
                                {tx(lang,{fr:'Atelier:',ar:'الورشة:',en:'Workshop:',es:'Taller:',pt:'Oficina:',tr:'Atölye:'})} {order.subcontractorName}
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
                              <p className="text-slate-400 dark:text-dk-muted text-[10px] mt-0.5">{tx(lang,{fr:'Livraison:',ar:'التسليم:',en:'Delivery:',es:'Entrega:',pt:'Entrega:',tr:'Teslimat:'})} {fmtDate(order.deliveryDate)}</p>
                            </div>
                          </div>

                          {/* Multi-segment Progress bar */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold">
                              <span className="text-slate-500 dark:text-dk-muted flex items-center gap-1">
                                {tx(lang,{fr:'Progression :',ar:'التقدم:',en:'Progress:',es:'Progresión:',pt:'Progresso:',tr:'İlerleme:'})} {progress}%
                                {/* A3 : la barre est bornée à 100 % pour rester lisible, mais le
                                    dépassement ne doit pas être masqué — il signale une saisie
                                    qualité incohérente avec la quantité commandée. */}
                                {overCounted && (
                                  <AlertTriangle
                                    className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0"
                                    aria-label={overflowLabel}
                                  >
                                    <title>{overflowLabel}</title>
                                  </AlertTriangle>
                                )}
                              </span>
                              <span className={`${overCounted ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-dk-accent'}`} dir="ltr" title={overCounted ? overflowLabel : undefined}>
                                {controlledQty.toLocaleString(dateLocale)} / {order.totalQuantity.toLocaleString(dateLocale)} pcs
                              </span>
                            </div>
                            <div className={`w-full bg-slate-100 dark:bg-dk-elevated h-2 rounded-full overflow-hidden flex ${overCounted ? 'ring-1 ring-amber-400 dark:ring-amber-500' : ''}`}>
                              <div className="bg-emerald-500 dark:bg-emerald-400 h-full transition-all duration-300" style={{ width: `${accPct}%` }} title={`${labelAccepted}: ${qtyAcc}`} />
                              <div className="bg-amber-400 dark:bg-amber-300 h-full transition-all duration-300" style={{ width: `${repPct}%` }} title={`${labelRework}: ${qtyRep}`} />
                              <div className="bg-rose-500 dark:bg-rose-400 h-full transition-all duration-300" style={{ width: `${rejPct}%` }} title={`${labelRejected}: ${qtyRej}`} />
                            </div>
                            {/* Detailed Quality Legend */}
                            <div className="flex items-center gap-3 text-[9px] font-semibold text-slate-500 dark:text-dk-muted justify-between">
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" /> {qtyAcc} {labelAccepted}</span>
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-300" /> {qtyRep} {labelRework}</span>
                              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400" /> {qtyRej} {labelRejected}</span>
                            </div>
                          </div>

                          {/* Jalons logistiques — cliquables, ils remplacent l'ancien onglet « Logistique » */}
                          <div className="flex flex-wrap gap-1 pt-1.5 border-t border-slate-100 dark:border-dk-border">
                            {milestoneChips(order).map(chip => (
                              <MilestoneChip key={chip.field} {...chip} onToggle={() => requestToggleMilestone(order, chip.field)} />
                            ))}
                            {readCustomMilestones(order).map(m => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => handleToggleCustomMilestone(order, m.id)}
                                title={tx(lang,{fr:'Cliquer pour basculer',ar:'انقر للتبديل',en:'Click to toggle',es:'Clic para alternar',pt:'Clique para alternar',tr:'Değiştirmek için tıklayın'})}
                                className={`font-bold rounded border flex items-center gap-1 text-[9px] px-2 py-1 transition-colors ${
                                  m.done ? customMilestoneColor(m.id) : 'bg-slate-50 dark:bg-dk-bg text-slate-400 dark:text-dk-muted border-slate-200 dark:border-dk-border'
                                }`}
                              >
                                {m.done ? <Check className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5 opacity-0" />}
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>

                      {/* Card Actions Footer */}
                        <div className="px-5 py-3.5 bg-slate-50 dark:bg-dk-surface/50 border-t border-slate-100 dark:border-dk-border flex items-center justify-between gap-3 text-xs font-bold">
                          <button 
                            onClick={() => { setDetailOrder(order); setIsDetailModalOpen(true); }}
                            className="text-slate-500 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent transition-colors flex items-center gap-1.5"
                          >
                            <Eye className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                            <span>{tx(lang,{fr:'Consulter',ar:'عرض',en:'View',es:'Consultar',pt:'Consultar',tr:'Görüntüle'})}</span>
                          </button>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => openEditModal(order)}
                              className="text-indigo-600 dark:text-dk-accent hover:text-indigo-700 dark:hover:text-dk-accent/90 transition-colors flex items-center gap-1"
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
                <div className="bg-white dark:bg-dk-surface rounded-3xl border border-slate-200 dark:border-dk-border/60 shadow-sm dark:shadow-none overflow-hidden">
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
                          <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/50 transition-colors group">
                            <td className="px-6 py-4 font-semibold">
                              <span className="text-[9px] text-indigo-600 dark:text-dk-accent block font-normal uppercase">{order.clientName || 'N/A'}</span>
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
                                className="text-xs font-bold text-slate-700 dark:text-dk-text-soft bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg p-1.5 focus:border-indigo-500 dark:focus:border-dk-accent outline-none hover:bg-slate-100 dark:hover:bg-dk-elevated"
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
                                <button onClick={() => openBonEnvoiModal(order)} className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-lg" title={tx(lang,{fr:"Bon d'envoi",ar:'مذكرة إرسال',en:'Delivery Note',es:'Nota de Envío',pt:'Nota de Remessa',tr:'Sevk İrsaliyesi'})}>
                                  <Printer className="w-4 h-4" />
                                </button>
                                <button onClick={() => openEditModal(order)} className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-lg">
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
                              className="lg:hidden fixed bottom-6 right-6 w-12 h-12 bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent/90 active:scale-95 text-white rounded-full shadow-lg dark:shadow-dk-lg flex items-center justify-center transition-all z-50 hover:shadow-xl border border-indigo-500 dark:border-dk-accent"
                              title={tx(lang,{fr:'Nouvelle Commande',ar:'أمر شراء جديد',en:'New Order',es:'Nuevo Pedido',pt:'Nova Encomenda',tr:'Yeni Sipariş'})}
                            >
                              <Plus className="w-6 h-6 text-white" />
                            </button>
                          </div>
                        )}

          {/* ======================================= */}
          {/* TAB 2: SOUS-TRAITANTS (SUBCONTRACTORS) */}
          {/* ======================================= */}
          {activeTab === 'subcontractors' && (
            <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-start">
              {/* Rail replié — visible seulement quand la liste est masquée */}
              {subListCollapsed && (
                <button
                  type="button"
                  onClick={toggleSubListCollapsed}
                  className="hidden lg:flex shrink-0 w-8 self-stretch min-h-[120px] items-center justify-center rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent-text hover:border-indigo-300 dark:hover:border-dk-accent/50 transition-colors"
                  title={tx(lang,{fr:'Afficher la liste',ar:'إظهار القائمة',en:'Show list',es:'Mostrar lista',pt:'Mostrar lista',tr:'Listeyi göster'})}
                >
                  <PanelLeftOpen className="w-4 h-4" strokeWidth={1.75} />
                </button>
              )}

              <div className={`w-full lg:w-[300px] xl:w-[330px] shrink-0 space-y-2 ${selectedSubcontractor ? 'hidden lg:block' : ''} ${subListCollapsed ? 'lg:hidden' : ''}`}>
                <div className="hidden lg:flex justify-end">
                  <button
                    type="button"
                    onClick={toggleSubListCollapsed}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent-text hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors"
                    title={tx(lang,{fr:'Masquer la liste',ar:'إخفاء القائمة',en:'Hide list',es:'Ocultar lista',pt:'Ocultar lista',tr:'Listeyi gizle'})}
                  >
                    <PanelLeftClose className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>{tx(lang,{fr:'Masquer',ar:'إخفاء',en:'Hide',es:'Ocultar',pt:'Ocultar',tr:'Gizle'})}</span>
                  </button>
                </div>
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
                    <div className="bg-white dark:bg-dk-surface rounded-3xl border border-slate-200 dark:border-dk-border/60 p-10 text-center text-slate-400 dark:text-dk-muted shadow-sm dark:shadow-none">
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

              <div className={`w-full flex-1 min-w-0 ${selectedSubcontractor ? '' : 'hidden lg:block'}`}>
                {!selectedSubcontractor ? (
                  <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/60 rounded-3xl p-16 text-center text-slate-400 dark:text-dk-muted h-full flex flex-col justify-center items-center shadow-sm dark:shadow-none">
                    <Users className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-xs font-semibold">{tx(lang,{fr:'Sélectionnez un sous-traitant pour voir ses modèles.',ar:'اختر مقاولاً من الباطن لعرض موديلاته.',en:'Select a subcontractor to see their models.',es:'Seleccione un subcontratista para ver sus modelos.',pt:'Selecione um subcontratado para ver os seus modelos.',tr:'Modellerini görmek için bir taşeron seçin.'})}</p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/60 rounded-3xl overflow-hidden shadow-sm dark:shadow-none">
                    <button
                      type="button"
                      onClick={() => setSelectedSubcontractorName(null)}
                      className="lg:hidden w-full flex items-center gap-1.5 px-4 pt-3 text-[11px] font-bold text-slate-500 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent-text transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                      <span>{tx(lang,{fr:'Retour',ar:'رجوع',en:'Back',es:'Volver',pt:'Voltar',tr:'Geri'})}</span>
                    </button>
                    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-dk-border flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {selectedSubcontractor.profile?.photo ? (
                          <button type="button" onClick={() => setImagePreviewSrc(selectedSubcontractor.profile!.photo!)} className="shrink-0">
                            <img src={selectedSubcontractor.profile.photo} alt={selectedSubcontractor.name} className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-dk-border" />
                          </button>
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                            <Users className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                          </div>
                        )}
                        <div className="min-w-0 leading-tight">
                          <h3 className="font-bold text-[13px] text-slate-800 dark:text-dk-text truncate">{selectedSubcontractor.name}</h3>
                          <p className="text-[10px] text-slate-400 dark:text-dk-muted truncate">
                            {[selectedSubcontractor.profile?.contactName, selectedSubcontractor.phone].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="text-right leading-tight mr-1">
                          <p className="text-[9px] text-slate-400 dark:text-dk-muted uppercase font-bold">{tx(lang,{fr:'Total',ar:'المجموع',en:'Total',es:'Total',pt:'Total',tr:'Toplam'})}</p>
                          <p className="font-bold text-[13px] text-slate-800 dark:text-dk-text whitespace-nowrap">{selectedSubcontractor.totalAmount.toLocaleString()} MAD</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => selectedSubcontractor.profile
                            ? openEditProfileModal(selectedSubcontractor.profile)
                            : openNewProfileModal()}
                          className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-slate-600 dark:hover:text-dk-text-soft transition-colors"
                          title={tx(lang,{fr:'Modifier le profil',ar:'تعديل الملف',en:'Edit profile',es:'Editar perfil',pt:'Editar perfil',tr:'Profili düzenle'})}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {selectedSubcontractor.profile ? (
                      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-dk-border grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-2 bg-slate-50/60 dark:bg-dk-bg/40">
                        {[
                          { label: tx(lang,{fr:'CIN',ar:'البطاقة الوطنية',en:'National ID',es:'CIN',pt:'CIN',tr:'Kimlik No'}), value: selectedSubcontractor.profile.cin || '—' },
                          { label: 'ICE', value: selectedSubcontractor.profile.ice || '—' },
                          { label: 'RC', value: selectedSubcontractor.profile.rc || '—' },
                          { label: tx(lang,{fr:'Adresse',ar:'العنوان',en:'Address',es:'Dirección',pt:'Morada',tr:'Adres'}), value: selectedSubcontractor.profile.address || '—' },
                          { label: tx(lang,{fr:'Notes',ar:'ملاحظات',en:'Notes',es:'Notas',pt:'Notas',tr:'Notlar'}), value: selectedSubcontractor.profile.notes || '—' },
                        ].map(f => (
                          <div key={f.label} className="min-w-0 leading-tight">
                            <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide">{f.label}</p>
                            <p className="text-[12px] font-semibold text-slate-700 dark:text-dk-text-soft truncate" title={f.value}>{f.value}</p>
                          </div>
                        ))}
                        {(() => {
                          // La note du sous-traitant n'est pas saisie : c'est la
                          // moyenne des notes données commande par commande.
                          const rated = selectedSubcontractor.orders.filter(o => (o.subcontractorRating || 0) > 0);
                          const avg = rated.length
                            ? rated.reduce((s, o) => s + (o.subcontractorRating || 0), 0) / rated.length
                            : 0;
                          return (
                            <div className="min-w-0 leading-tight">
                              <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide">
                                {tx(lang,{fr:'Évaluation',ar:'التقييم',en:'Rating',es:'Evaluación',pt:'Avaliação',tr:'Değerlendirme'})}
                              </p>
                              {rated.length === 0 ? (
                                <p className="text-[12px] font-semibold text-slate-400 dark:text-dk-muted">—</p>
                              ) : (
                                <p className="text-[12px] font-semibold text-amber-500 flex items-center gap-1">
                                  <span>{'★'.repeat(Math.round(avg))}{'☆'.repeat(5 - Math.round(avg))}</span>
                                  <span className="text-slate-400 dark:text-dk-muted font-bold text-[10px]">
                                    {avg.toFixed(1)} · {rated.length}
                                  </span>
                                </p>
                              )}
                            </div>
                          );
                        })()}
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
                            <th className="px-4 py-3">{tx(lang,{fr:'Évaluation',ar:'التقييم',en:'Rating',es:'Evaluación',pt:'Avaliação',tr:'Değerlendirme'})}</th>
                            <th className="px-4 py-3 text-right">{tx(lang,{fr:'Fiche',ar:'البطاقة',en:'Sheet',es:'Ficha',pt:'Ficha',tr:'Kart'})}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                          {selectedSubcontractor.orders.map(o => {
                            const m = models.find(mm => mm.id === o.modelId);
                            const total = (o.totalQuantity || 0) * (o.pricePerPiece || 0);
                            return (
                              <tr
                                key={o.id}
                                onClick={() => { if (m) { setModelInfoOrderId(o.id); setModelInfoTarget(m); } }}
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
                                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-0.5">
                                    {[1, 2, 3, 4, 5].map(n => (
                                      <button
                                        key={n}
                                        type="button"
                                        onClick={() => handleRateOrder(o, n)}
                                        className="p-0.5 rounded hover:scale-110 transition-transform"
                                        title={`${n}/5`}
                                      >
                                        <Star
                                          className={`w-3.5 h-3.5 ${n <= (o.subcontractorRating || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-dk-border'}`}
                                        />
                                      </button>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => { setDetailOrder(o); setIsDetailModalOpen(true); }}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-dk-accent-text hover:underline whitespace-nowrap"
                                  >
                                    <span>{tx(lang,{fr:'Voir la fiche',ar:'عرض البطاقة',en:'View sheet',es:'Ver ficha',pt:'Ver ficha',tr:'Kartı gör'})}</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
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
            </div>
          )}

          {/* ======================================= */}
          {/* TAB 3: STOCK & VENTES (STOCK & SALES) */}
          {/* ======================================= */}
          {activeTab === 'clients' && (
            <ClientsPanel
              onChanged={setAtelierClients}
              sorties={allStockSorties}
              onOpenClient={(c) => openEntitySheet({ kind: 'client', clientId: String(c.id), clientNom: c.nom })}
              editClientId={pendingEditClientId}
              onEditConsumed={() => setPendingEditClientId(null)}
              currency={currency}
              dateLocale={dateLocale}
            />
          )}

          {activeTab === 'stock' && (
            <div className="space-y-4">
              {/* Barre d'indicateurs : un stock fini se pilote d'abord par sa
                  VALEUR immobilisée, pas par le nombre de lignes du tableau.
                  Une seule ligne, toujours — sur petit écran elle défile
                  horizontalement au lieu de s'empiler en 2x2, pour rester un
                  vrai bandeau de synthèse qu'on lit d'un balayage. */}
              <div className="relative">
                {/* Rien ne dit qu'un bandeau défile tant qu'on n'a pas essayé :
                    sur mobile, un dégradé au bord droit avoue qu'il reste du
                    contenu à balayer, plutôt qu'une carte coupée à la hussarde
                    qui se lit comme une erreur d'affichage. */}
                <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-slate-50 dark:from-dk-bg to-transparent sm:hidden z-10" aria-hidden="true" />
                <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
                {/* Valorisation au cout : masquee en bloc quand le cloisonnement
                    commercial est actif. Afficher 0 serait une information FAUSSE. */}
                {canSeeCostHere && (
                  <div className="shrink-0 min-w-[150px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3.5 py-3">
                    <span className="block text-[9px] uppercase tracking-wide text-slate-400 dark:text-dk-muted font-semibold whitespace-nowrap">
                      {tx(lang,{fr:'Valeur du stock (revient)',ar:'قيمة المخزون (بالتكلفة)',en:'Stock value (cost)',es:'Valor del stock (coste)',pt:'Valor do stock (custo)',tr:'Stok degeri (maliyet)'})}
                    </span>
                    <span className="block mt-1 font-bold text-slate-800 dark:text-dk-text text-sm whitespace-nowrap">{fmt(stockKpis.value)} {currency}</span>
                  </div>
                )}
                <div className="shrink-0 min-w-[150px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3.5 py-3">
                  <span className="block text-[9px] uppercase tracking-wide text-slate-400 dark:text-dk-muted font-semibold whitespace-nowrap">
                    {tx(lang,{fr:'Pièces disponibles',ar:'القطع المتوفّرة',en:'Available pieces',es:'Piezas disponibles',pt:'Pecas disponiveis',tr:'Mevcut parca'})}
                  </span>
                  <span className="block mt-1 font-bold text-slate-800 dark:text-dk-text text-sm">{stockKpis.available.toLocaleString(dateLocale)}</span>
                </div>
                <div className="shrink-0 min-w-[150px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3.5 py-3">
                  <span className="block text-[9px] uppercase tracking-wide text-slate-400 dark:text-dk-muted font-semibold whitespace-nowrap">
                    {tx(lang,{fr:'Pièces sorties',ar:'القطع المخرَجة',en:'Pieces exited',es:'Piezas salidas',pt:'Pecas saidas',tr:'Cikan parca'})}
                  </span>
                  <span className="block mt-1 font-bold text-slate-800 dark:text-dk-text text-sm">{stockKpis.exited.toLocaleString(dateLocale)}</span>
                </div>
                <div className="shrink-0 min-w-[190px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3.5 py-3">
                  <span className="block text-[9px] uppercase tracking-wide text-slate-400 dark:text-dk-muted font-semibold whitespace-nowrap">
                    {tx(lang,{fr:'Modèles sans prix de vente',ar:'موديلات بلا ثمن بيع',en:'Models without sale price',es:'Modelos sin precio de venta',pt:'Modelos sem preco de venda',tr:'Satis fiyati olmayan model'})}
                  </span>
                  <span className={`block mt-1 font-bold text-sm ${stockKpis.noPrice > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-dk-text'}`}>
                    {stockKpis.noPrice.toLocaleString(dateLocale)}
                  </span>
                </div>
                </div>
              </div>

              {/* Recherche + filtres d'intention */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                {/* Cartes vs tableau : la grille couleur x taille reste ouverte
                    en permanence dans les cartes — c'est elle qui répond à « me
                    reste-t-il du XL bleu ? », pas le total. Le tableau reste
                    utile pour un balayage rapide de nombreux modèles. Le
                    bouton n'a de sens qu'à partir de md : en dessous, le
                    tableau est de toute façon illisible et les cartes
                    s'imposent seules. */}
                <div className="hidden md:inline-flex shrink-0 rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setStockViewMode('cards')}
                    title={tx(lang,{fr:'Vue cartes : grille couleur x taille toujours visible',ar:'عرض البطاقات: شبكة اللون والمقاس ظاهرة دائماً',en:'Card view: color x size grid always visible',es:'Vista de tarjetas: rejilla color x talla siempre visible',pt:'Vista de cartoes: grelha cor x tamanho sempre visivel',tr:'Kart gorunumu: renk x beden izgarasi her zaman gorunur'})}
                    className={stockViewMode === 'cards'
                      ? 'px-3 py-2 text-[11px] font-bold flex items-center gap-1.5 bg-slate-800 dark:bg-dk-accent text-white transition-colors'
                      : 'px-3 py-2 text-[11px] font-bold flex items-center gap-1.5 bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors'}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    {tx(lang,{fr:'Cartes',ar:'بطاقات',en:'Cards',es:'Tarjetas',pt:'Cartoes',tr:'Kartlar'})}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockViewMode('table')}
                    title={tx(lang,{fr:'Vue tableau : balayage rapide, détail sur demande',ar:'عرض الجدول: مسح سريع، التفصيل عند الطلب',en:'Table view: quick scan, detail on demand',es:'Vista de tabla: barrido rápido, detalle bajo demanda',pt:'Vista de tabela: varredura rapida, detalhe sob pedido',tr:'Tablo gorunumu: hizli tarama, istege bagli detay'})}
                    className={stockViewMode === 'table'
                      ? 'px-3 py-2 text-[11px] font-bold flex items-center gap-1.5 bg-slate-800 dark:bg-dk-accent text-white border-l border-slate-800 dark:border-dk-accent transition-colors'
                      : 'px-3 py-2 text-[11px] font-bold flex items-center gap-1.5 bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated border-l border-slate-200 dark:border-dk-border transition-colors'}
                  >
                    <Table className="w-3.5 h-3.5" />
                    {tx(lang,{fr:'Tableau',ar:'جدول',en:'Table',es:'Tabla',pt:'Tabela',tr:'Tablo'})}
                  </button>
                </div>
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-dk-muted pointer-events-none" />
                  <input
                    type="text"
                    value={stockSearch}
                    onChange={e => setStockSearch(e.target.value)}
                    placeholder={tx(lang,{fr:'Rechercher un modèle ou un client…',ar:'قلّب على موديل ولا عميل…',en:'Search a model or a client…',es:'Buscar un modelo o un cliente…',pt:'Procurar um modelo ou cliente…',tr:'Model veya musteri ara…'})}
                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl pl-9 pr-3 py-2 text-[12px] text-slate-800 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    { id: 'all', label: tx(lang,{fr:'Tous',ar:'الكل',en:'All',es:'Todos',pt:'Todos',tr:'Tumu'}) },
                    { id: 'inStock', label: tx(lang,{fr:'En stock',ar:'ف المخزون',en:'In stock',es:'En stock',pt:'Em stock',tr:'Stokta'}) },
                    { id: 'noPrice', label: tx(lang,{fr:'Sans prix de vente',ar:'بلا ثمن بيع',en:'No sale price',es:'Sin precio de venta',pt:'Sem preco de venda',tr:'Satis fiyati yok'}) },
                    { id: 'unventilated', label: tx(lang,{fr:'Non ventilé',ar:'غير مفصّل',en:'Not itemised',es:'Sin desglose',pt:'Sem desdobramento',tr:'Ayrintisiz'}) },
                  ] as const).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setStockFilter(p.id)}
                      className={stockFilter === p.id
                        ? 'px-3 py-1.5 rounded-lg text-[11px] font-bold border bg-slate-800 dark:bg-dk-accent text-white border-slate-800 dark:border-dk-accent transition-colors'
                        : 'px-3 py-1.5 rounded-lg text-[11px] font-bold border bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors'}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredStockStats.length === 0 && (
                <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-2xl px-4 py-8 text-center text-[12px] text-slate-500 dark:text-dk-muted">
                  {tx(lang,{fr:'Aucun modèle ne correspond à cette recherche.',ar:'ما كاين حتّى موديل كيوافق هاد البحث.',en:'No model matches this search.',es:'Ningún modelo coincide con esta búsqueda.',pt:'Nenhum modelo corresponde a esta pesquisa.',tr:'Bu aramaya uyan model yok.'})}
                </div>
              )}

              {/* Vue mobile : cartes (le tableau ci-dessous devient illisible sous md) */}
              <div className={stockViewMode === 'table' ? 'md:hidden space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}>
                {filteredStockStats.map(item => (
                  <div key={item.model.id} className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border/60 shadow-sm dark:shadow-none p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                        {item.model.image ? (
                          <img src={item.model.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-5 h-5 text-slate-400 dark:text-dk-muted" />
                        )}
                      </div>
                      {/* Le nom du modèle n'est plus une étiquette morte : il ouvre
                          sa fiche (stock ventilé, marge, acheteurs, historique). */}
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => openEntitySheet({ kind: 'model', modelId: item.model.id })}
                          className="font-semibold block text-slate-800 dark:text-dk-text truncate text-left hover:text-indigo-600 dark:hover:text-dk-accent hover:underline underline-offset-2 transition-colors w-full"
                        >
                          {item.model.meta_data.nom_modele}
                        </button>
                        <span className="text-[9px] text-indigo-600 dark:text-dk-accent block font-normal uppercase">
                          {tx(lang,{fr:'Client:',ar:'العميل:',en:'Client:',es:'Cliente:',pt:'Cliente:',tr:'Müşteri:'})}{' '}
                          {item.model.ficheData?.client ? (
                            <button
                              type="button"
                              onClick={() => openEntitySheet({ kind: 'client', clientNom: item.model.ficheData?.client })}
                              className="hover:underline underline-offset-2 uppercase"
                            >
                              {item.model.ficheData.client}
                            </button>
                          ) : 'N/A'}
                        </span>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase whitespace-nowrap shrink-0 ${
                        item.status === 'FINISHED' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' :
                        item.status === 'IN_PRODUCTION' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50' :
                        'bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border'
                      }`}>
                        {item.status === 'FINISHED' ? tx(lang,{fr:'Terminé',ar:'منتهٍ',en:'Finished',es:'Terminado',pt:'Terminado',tr:'Bitti'}) :
                         item.status === 'IN_PRODUCTION' ? tx(lang,{fr:'En production',ar:'قيد الإنتاج',en:'In production',es:'En producción',pt:'Em produção',tr:'Üretimde'}) :
                         tx(lang,{fr:'Inactif',ar:'غير نشط',en:'Inactive',es:'Inactivo',pt:'Inativo',tr:'Pasif'})}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      <div className="bg-slate-50 dark:bg-dk-bg/60 rounded-lg py-2">
                        <span className="block text-[9px] uppercase text-slate-400 dark:text-dk-muted font-semibold">{tx(lang,{fr:'Produit',ar:'المنتج',en:'Produced',es:'Producido',pt:'Produzido',tr:'Üretilen'})}</span>
                        <span className="block font-bold text-slate-800 dark:text-dk-text text-xs">{item.producedQty.toLocaleString(dateLocale)}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-dk-bg/60 rounded-lg py-2">
                        <span className="block text-[9px] uppercase text-slate-400 dark:text-dk-muted font-semibold">{tx(lang,{fr:'Sorti',ar:'مخرَج',en:'Exited',es:'Salido',pt:'Saido',tr:'Cikan'})}</span>
                        <span className="block font-bold text-slate-700 dark:text-dk-text-soft text-xs">{item.exitedQty.toLocaleString(dateLocale)}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-dk-bg/60 rounded-lg py-2">
                        <span className="block text-[9px] uppercase text-slate-400 dark:text-dk-muted font-semibold">{tx(lang,{fr:'Facturé',ar:'مفوتر',en:'Invoiced',es:'Facturado',pt:'Faturado',tr:'Faturali'})}</span>
                        <span
                          title={item.exitedQty !== item.invoicedQty ? tx(lang,{fr:"Écart entre les pièces sorties du stock et les pièces facturées.",ar:'فرق بين القطع المخرَجة من المخزون والقطع المفوترة.',en:'Gap between pieces exited from stock and pieces invoiced.',es:'Diferencia entre las piezas salidas y las facturadas.',pt:'Diferenca entre as pecas saidas e as faturadas.',tr:'Stoktan cikan ile faturalanan parca arasindaki fark.'}) : undefined}
                          className={`block font-bold text-xs ${item.exitedQty !== item.invoicedQty ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-dk-accent'}`}
                        >
                          {item.invoicedQty.toLocaleString(dateLocale)}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-dk-bg/60 rounded-lg py-2">
                        <span className="block text-[9px] uppercase text-slate-400 dark:text-dk-muted font-semibold">{tx(lang,{fr:'Restant',ar:'المتبقي',en:'Remaining',es:'Restante',pt:'Restante',tr:'Kalan'})}</span>
                        <span
                          title={item.stockSource === 'FALLBACK' ? tx(lang,{fr:"Stock non détaillé par couleur et taille : ce total vient des compteurs de la commande.",ar:'المخزون غير مفصّل باللون والمقاس: هاد المجموع جاي من عدّادات الطلبية.',en:'Stock not itemised by color and size: this total comes from the order counters.',es:'Stock sin desglose por color y talla: este total viene de los contadores del pedido.',pt:'Stock sem desdobramento por cor e tamanho: este total vem dos contadores da encomenda.',tr:'Stok renk ve bedene gore ayrilmamis: bu toplam siparis sayaclarindan geliyor.'}) : undefined}
                          className={`block font-bold text-xs ${item.stockSource === 'FALLBACK' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                        >
                          {item.remainingStock.toLocaleString(dateLocale)}
                        </span>
                      </div>
                    </div>

                    {item.stockSource === 'FALLBACK' && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                        <AlertTriangle className="w-3 h-3" />
                        {tx(lang,{fr:'non ventilé',ar:'غير مفصّل',en:'not itemised',es:'sin desglose',pt:'sem desdobramento',tr:'ayrintisiz'})}
                      </span>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="block text-[9px] uppercase text-slate-400 dark:text-dk-muted font-semibold">{tx(lang,{fr:'Date lancement',ar:'تاريخ الإطلاق',en:'Launch date',es:'Fecha de inicio',pt:'Data de lançamento',tr:'Başlangıç tarihi'})}</span>
                        <span className="text-slate-600 dark:text-dk-text-soft text-[11px]">{item.startDate}</span>
                        {/* Compte les gestes (sorties, commandes), pas les pièces. */}
                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted mt-1">
                          {tx(lang,{fr:'sorties',ar:'مرّات الخروج',en:'exits',es:'salidas',pt:'saidas',tr:'cikislar'})} : {item.sortiesCount.toLocaleString(dateLocale)}
                          {' · '}
                          {tx(lang,{fr:'commandes',ar:'الطلبيات',en:'orders',es:'pedidos',pt:'encomendas',tr:'siparisler'})} : {item.ordersCount.toLocaleString(dateLocale)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[9px] uppercase text-slate-400 dark:text-dk-muted font-semibold">{tx(lang,{fr:'Prix de vente',ar:'ثمن البيع',en:'Sale price',es:'Precio de venta',pt:'Preço de venda',tr:'Satis fiyati'})}</span>
                        {editingPriceModelId === item.model.id ? (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            autoFocus
                            value={editingPriceValue}
                            onChange={e => setEditingPriceValue(e.target.value)}
                            onBlur={() => commitInlinePrice(item.model.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              if (e.key === 'Escape') setEditingPriceModelId(null);
                            }}
                            className="w-24 text-right bg-slate-50 dark:bg-dk-bg border border-indigo-500 dark:border-dk-accent rounded-lg px-2 py-1 text-[11px] text-slate-800 dark:text-dk-text outline-none"
                          />
                        ) : canSetPriceHere ? (
                          <button
                            type="button"
                            onClick={() => { setEditingPriceModelId(item.model.id); setEditingPriceValue(item.salePrice != null && item.salePrice > 0 ? String(item.salePrice) : ''); }}
                            className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-dk-text text-[11px] hover:text-indigo-600 dark:hover:text-dk-accent transition-colors"
                          >
                            {item.salePrice != null && item.salePrice > 0 ? `${fmt(item.salePrice)} ${currency}` : '—'}
                            {savingPriceModelId === item.model.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />}
                          </button>
                        ) : (
                          /* Sans droit de fixer les prix : lecture seule, pas de leurre cliquable. */
                          <span className="font-semibold text-slate-800 dark:text-dk-text text-[11px]">
                            {item.salePrice != null && item.salePrice > 0 ? `${fmt(item.salePrice)} ${currency}` : '—'}
                          </span>
                        )}
                        {canSeeCostHere && (
                          <span className="block text-[9px] text-slate-400 dark:text-dk-muted">
                            {tx(lang,{fr:'revient',ar:'التكلفة',en:'cost',es:'coste',pt:'custo',tr:'maliyet'})} : {item.price == null ? '—' : `${fmt(item.price)} ${currency}`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Un bouton qui ouvre un cul-de-sac est pire qu'un bouton absent :
                        sans réception ventilée, la grille de sortie est vide. */}
                    {item.stockSource === 'FALLBACK' ? (
                      <button
                        onClick={() => { setStockDetailTouched(true); setExpandedStockModel(item.model.id); }}
                        className="w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all border bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                      >
                        {tx(lang,{fr:'Ventiler',ar:'فصّل',en:'Itemise',es:'Desglosar',pt:'Desdobrar',tr:'Ayrintila'})}
                      </button>
                    ) : (
                      <button
                        disabled={item.remainingStock <= 0}
                        onClick={() => openSortieModal(item.model, item.salePrice)}
                        className={`w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm dark:shadow-none ${
                          item.remainingStock > 0
                            ? 'bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent/90 text-white'
                            : 'bg-slate-100 dark:bg-dk-elevated text-slate-400 dark:text-dk-muted cursor-not-allowed border border-slate-200 dark:border-dk-border'
                        }`}
                      >
                        {tx(lang,{fr:'Sortie Facture',ar:'إخراج فاتورة',en:'Issue Invoice',es:'Emitir Factura',pt:'Emitir Fatura',tr:'Fatura Kes'})}
                      </button>
                    )}

                    {item.stockSource === 'FALLBACK' && expandedStockModel === item.model.id && (
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
                        {tx(lang,{
                          fr:`Les ${item.remainingStock} pièces ont été comptabilisées globalement. Saisissez la réception détaillée par couleur et taille dans l'onglet Commandes pour pouvoir vendre.`,
                          ar:`${item.remainingStock} قطعة تسجّلات بشكل إجمالي. دخّل الاستلام المفصّل باللون والمقاس ف علامة الطلبيات باش تقدر تبيع.`,
                          en:`The ${item.remainingStock} pieces were counted globally. Enter the detailed reception by color and size in the Orders tab to be able to sell.`,
                          es:`Las ${item.remainingStock} piezas se contabilizaron globalmente. Introduzca la recepción detallada por color y talla en la pestaña Pedidos para poder vender.`,
                          pt:`As ${item.remainingStock} pecas foram contabilizadas globalmente. Introduza a rececao detalhada por cor e tamanho no separador Encomendas para poder vender.`,
                          tr:`${item.remainingStock} parca toplu olarak sayildi. Satis yapabilmek icin Siparisler sekmesinde renk ve bedene gore detayli kabulu girin.`
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className={stockViewMode === 'table' ? 'hidden md:block bg-white dark:bg-dk-surface rounded-3xl border border-slate-200 dark:border-dk-border/60 shadow-sm dark:shadow-none overflow-hidden' : 'hidden'}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-dk-bg border-b border-slate-100 dark:border-dk-border text-slate-500 dark:text-dk-muted font-semibold text-xs uppercase">
                      <tr>
                        {/* Neuf colonnes forçaient un défilement horizontal sur tout
                            écran qui n'est pas plein écran. Cinq colonnes regroupent
                            ce qui se lit ensemble : le modèle porte son client, sa
                            date et son état ; le flux se lit comme un parcours plutôt
                            que quatre chiffres qui se disputent l'œil. */}
                        <th className="px-6 py-4">{tx(lang,{fr:'Modèle',ar:'الموديل',en:'Model',es:'Modelo',pt:'Modelo',tr:'Model'})}</th>
                        <th className="px-6 py-4">{tx(lang,{fr:'Lancement',ar:'الإطلاق',en:'Launch',es:'Inicio',pt:'Lançamento',tr:'Başlangıç'})}</th>
                        <th className="px-6 py-4">{tx(lang,{fr:'Flux',ar:'التدفّق',en:'Flow',es:'Flujo',pt:'Fluxo',tr:'Akis'})}</th>
                        <th className="px-6 py-4">{tx(lang,{fr:'Prix',ar:'الثمن',en:'Price',es:'Precio',pt:'Preco',tr:'Fiyat'})}</th>
                        <th className="px-6 py-4 text-right">{tx(lang,{fr:'Actions',ar:'الإجراءات',en:'Actions',es:'Acciones',pt:'Ações',tr:'İşlemler'})}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-dk-border text-slate-700 dark:text-dk-text-soft bg-white dark:bg-dk-surface">
                      {/* Fragment : chaque modèle produit DEUX lignes — la ligne
                          principale et, dépliée, sa grille couleur x taille. */}
                      {filteredStockStats.map(item => (
                        <React.Fragment key={item.model.id}>
                        <tr className="hover:bg-slate-50 dark:hover:bg-dk-elevated/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                                {item.model.image ? (
                                  <img src={item.model.image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-5 h-5 text-slate-400 dark:text-dk-muted" />
                                )}
                              </div>
                              {/* Même règle qu'en mobile : toute mention d'une entité
                                  est un lien vers sa fiche. Client, état, date de
                                  lancement et compteurs de gestes vivent ici avec le
                                  modèle : ils se lisent ensemble, pas dans des colonnes
                                  qui forcent l'œil à faire des allers-retours. */}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => openEntitySheet({ kind: 'model', modelId: item.model.id })}
                                    className="font-semibold text-slate-800 dark:text-dk-text text-left hover:text-indigo-600 dark:hover:text-dk-accent hover:underline underline-offset-2 transition-colors"
                                  >
                                    {item.model.meta_data.nom_modele}
                                  </button>
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase whitespace-nowrap ${
                                    item.status === 'FINISHED' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' :
                                    item.status === 'IN_PRODUCTION' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50' :
                                    'bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border'
                                  }`}>
                                    {item.status === 'FINISHED' ? tx(lang,{fr:'Terminé',ar:'منتهٍ',en:'Finished',es:'Terminado',pt:'Terminado',tr:'Bitti'}) :
                                     item.status === 'IN_PRODUCTION' ? tx(lang,{fr:'En production',ar:'قيد الإنتاج',en:'In production',es:'En producción',pt:'Em produção',tr:'Üretimde'}) :
                                     tx(lang,{fr:'Inactif',ar:'غير نشط',en:'Inactive',es:'Inactivo',pt:'Inativo',tr:'Pasif'})}
                                  </span>
                                </div>
                                <span className="text-[9px] text-indigo-600 dark:text-dk-accent block font-normal uppercase">
                                  {tx(lang,{fr:'Client:',ar:'العميل:',en:'Client:',es:'Cliente:',pt:'Cliente:',tr:'Müşteri:'})}{' '}
                                  {item.model.ficheData?.client ? (
                                    <button
                                      type="button"
                                      onClick={() => openEntitySheet({ kind: 'client', clientNom: item.model.ficheData?.client })}
                                      className="hover:underline underline-offset-2 uppercase"
                                    >
                                      {item.model.ficheData.client}
                                    </button>
                                  ) : 'N/A'}
                                </span>
                                <span className="text-[10px] text-slate-400 dark:text-dk-muted block mt-0.5">
                                  {/* Compte les GESTES (sorties, commandes), pas les
                                      pièces : « combien de fois ai-je vendu / reçu
                                      ce modèle ? » n'est pas la même question que
                                      « combien de pièces ? ». */}
                                  {tx(lang,{fr:'sorties',ar:'مرّات الخروج',en:'exits',es:'salidas',pt:'saidas',tr:'cikislar'})} : {item.sortiesCount.toLocaleString(dateLocale)}
                                  {' · '}
                                  {tx(lang,{fr:'commandes',ar:'الطلبيات',en:'orders',es:'pedidos',pt:'encomendas',tr:'siparisler'})} : {item.ordersCount.toLocaleString(dateLocale)}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-dk-muted whitespace-nowrap">
                            {item.startDate}
                          </td>
                          {/* Le flux se lit comme un parcours — produit puis sorti puis
                              facturé puis restant — plutôt que quatre chiffres isolés
                              qui se disputent l'attention dans des colonnes séparées. */}
                          <td className="px-6 py-4">
                            {/* Chaque étape porte sa propre icône plutôt qu'un simple
                                chiffre entre deux flèches : l'œil identifie la nature
                                de l'étape (produit, sorti, facturé, en stock) sans
                                avoir à relire la légende en dessous à chaque fois. */}
                            <div className="flex items-center gap-1 text-[12px] font-semibold text-slate-700 dark:text-dk-text-soft whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 text-slate-800 dark:text-dk-text" title={tx(lang,{fr:'Produit',ar:'المنتج',en:'Produced',es:'Producido',pt:'Produzido',tr:'Uretilen'})}>
                                <Package className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0" />
                                {item.producedQty.toLocaleString(dateLocale)}
                              </span>
                              <ChevronRight className="w-3 h-3 text-slate-300 dark:text-dk-muted shrink-0" />
                              <span className="inline-flex items-center gap-1" title={tx(lang,{fr:'Sorti (stock)',ar:'مخرَج (من المخزون)',en:'Exited (stock)',es:'Salido (stock)',pt:'Saido (stock)',tr:'Cikan (stok)'})}>
                                <Truck className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0" />
                                {item.exitedQty.toLocaleString(dateLocale)}
                              </span>
                              <ChevronRight className="w-3 h-3 text-slate-300 dark:text-dk-muted shrink-0" />
                              <span
                                className={item.exitedQty !== item.invoicedQty
                                  ? 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                                  : 'inline-flex items-center gap-1 text-indigo-600 dark:text-dk-accent'}
                                title={item.exitedQty !== item.invoicedQty
                                  ? `${tx(lang,{fr:'Écart sorti / facturé',ar:'فرق بين المخرَج والمفوتر',en:'Exited / invoiced gap',es:'Diferencia salido / facturado',pt:'Diferenca saido / faturado',tr:'Cikan / faturali farki'})} : ${(item.exitedQty - item.invoicedQty).toLocaleString(dateLocale)}`
                                  : tx(lang,{fr:'Facturé',ar:'مفوتر',en:'Invoiced',es:'Facturado',pt:'Faturado',tr:'Faturali'})}
                              >
                                <Receipt className="w-3.5 h-3.5 shrink-0" />
                                {item.invoicedQty.toLocaleString(dateLocale)}
                              </span>
                              <ChevronRight className="w-3 h-3 text-slate-300 dark:text-dk-muted shrink-0" />
                              <span
                                className={`inline-flex items-center gap-1 font-bold ${item.stockSource === 'FALLBACK' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                                title={item.stockSource === 'FALLBACK' ? tx(lang,{fr:"Stock non détaillé par couleur et taille : ce total vient des compteurs de la commande, aucune vente n'est possible en l'état.",ar:'المخزون غير مفصّل باللون والمقاس: هاد المجموع جاي من عدّادات الطلبية، والبيع مستحيل هكّاك.',en:'Stock not itemised by color and size: this total comes from the order counters, no sale is possible as is.',es:'Stock sin desglose por color y talla: este total viene de los contadores del pedido, no es posible vender así.',pt:'Stock sem desdobramento por cor e tamanho: este total vem dos contadores da encomenda, nao e possivel vender assim.',tr:'Stok renk ve bedene gore ayrilmamis: bu toplam siparis sayaclarindan geliyor, bu haliyle satis mumkun degil.'}) : tx(lang,{fr:'Stock Restant',ar:'المخزون المتبقي',en:'Remaining Stock',es:'Stock Restante',pt:'Stock Restante',tr:'Kalan Stok'})}
                              >
                                <Warehouse className="w-3.5 h-3.5 shrink-0" />
                                {item.remainingStock.toLocaleString(dateLocale)}
                              </span>
                            </div>
                            <div className="text-[9px] text-slate-400 dark:text-dk-muted mt-1">
                              {tx(lang,{fr:'produit · sorti · facturé · restant',ar:'المنتج · المخرَج · المفوتر · المتبقي',en:'produced · exited · invoiced · remaining',es:'producido · salido · facturado · restante',pt:'produzido · saido · faturado · restante',tr:'uretilen · cikan · faturali · kalan'})}
                            </div>
                            {item.exitedQty !== item.invoicedQty && (
                              <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50">
                                {(item.exitedQty - item.invoicedQty).toLocaleString(dateLocale)} {tx(lang,{fr:'non facturées',ar:'غير مفوترة',en:'not invoiced',es:'sin facturar',pt:'nao faturadas',tr:'faturasiz'})}
                              </span>
                            )}
                            {item.stockSource === 'FALLBACK' && (
                              <span className="inline-flex items-center gap-1 mt-1 ml-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 align-middle">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {tx(lang,{fr:'non ventilé',ar:'غير مفصّل',en:'not itemised',es:'sin desglose',pt:'sem desdobramento',tr:'ayrintisiz'})}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-800 dark:text-dk-text">
                            {/* Prix de VENTE éditable : c'est la seule donnée saisie ici,
                                le prix de revient reste calculé par la fiche de coût. */}
                            {editingPriceModelId === item.model.id ? (
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                autoFocus
                                value={editingPriceValue}
                                onChange={e => setEditingPriceValue(e.target.value)}
                                onBlur={() => commitInlinePrice(item.model.id)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                  if (e.key === 'Escape') setEditingPriceModelId(null);
                                }}
                                className="w-28 bg-slate-50 dark:bg-dk-bg border border-indigo-500 dark:border-dk-accent rounded-lg px-2 py-1 text-[12px] text-slate-800 dark:text-dk-text outline-none"
                              />
                            ) : canSetPriceHere ? (
                              <button
                                type="button"
                                onClick={() => { setEditingPriceModelId(item.model.id); setEditingPriceValue(item.salePrice != null && item.salePrice > 0 ? String(item.salePrice) : ''); }}
                                title={tx(lang,{fr:'Modifier le prix de vente',ar:'عدّل ثمن البيع',en:'Edit the sale price',es:'Modificar el precio de venta',pt:'Alterar o preco de venda',tr:'Satis fiyatini duzenle'})}
                                className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-dk-text hover:text-indigo-600 dark:hover:text-dk-accent transition-colors"
                              >
                                {item.salePrice != null && item.salePrice > 0
                                  ? `${fmt(item.salePrice)} ${currency}`
                                  : <span className="text-slate-400 dark:text-dk-muted italic">{tx(lang,{fr:'prix de vente non saisi',ar:'ثمن البيع غير مُدخَل',en:'sale price not set',es:'precio de venta no indicado',pt:'preço de venda não definido',tr:'satış fiyatı girilmedi'})}</span>}
                                {savingPriceModelId === item.model.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted" />}
                              </button>
                            ) : (
                              <span className="font-semibold text-slate-800 dark:text-dk-text">
                                {item.salePrice != null && item.salePrice > 0
                                  ? `${fmt(item.salePrice)} ${currency}`
                                  : <span className="text-slate-400 dark:text-dk-muted italic">{tx(lang,{fr:'prix de vente non saisi',ar:'ثمن البيع غير مُدخَل',en:'sale price not set',es:'precio de venta no indicado',pt:'preço de venda não definido',tr:'satış fiyatı girilmedi'})}</span>}
                              </span>
                            )}
                            {canSeeCostHere && (
                            <span className="block text-[10px] text-slate-400 dark:text-dk-muted">
                              {tx(lang,{fr:'revient',ar:'التكلفة',en:'cost',es:'coste',pt:'custo',tr:'maliyet'})} : {item.price == null ? '—' : `${fmt(item.price)} ${currency}`}
                              {item.salePrice != null && item.salePrice > 0 && item.price != null && item.price > 0 && (
                                <span className={item.salePrice > item.price ? ' text-emerald-600 dark:text-emerald-400' : ' text-rose-600 dark:text-rose-400'}>
                                  {' · '}{tx(lang,{fr:'marge',ar:'الهامش',en:'margin',es:'margen',pt:'margem',tr:'marj'})} {fmt(item.salePrice - item.price)} {currency}
                                  {' ('}{(((item.salePrice - item.price) / item.salePrice) * 100).toFixed(1)}{'%)'}
                                </span>
                              )}
                            </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            {/* Le détail par couleur x taille répond à « me reste-t-il
                                des XL bleus ? » ; le total seul ne le dit pas. */}
                            <button
                              onClick={() => toggleStockDetail(item.model.id)}
                              className="mr-2 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors"
                            >
                              {isStockDetailOpen(item.model.id)
                                ? tx(lang,{fr:'Masquer',ar:'إخفاء',en:'Hide',es:'Ocultar',pt:'Ocultar',tr:'Gizle'})
                                : tx(lang,{fr:'Détail',ar:'التفصيل',en:'Detail',es:'Detalle',pt:'Detalhe',tr:'Detay'})}
                            </button>
                            {item.stockSource === 'FALLBACK' ? (
                              <button
                                onClick={() => { setStockDetailTouched(true); setExpandedStockModel(item.model.id); }}
                                title={tx(lang,{fr:"Détaillez d'abord la réception par couleur et taille.",ar:'فصّل الاستلام باللون والمقاس أولاً.',en:'First itemise the reception by color and size.',es:'Detalle primero la recepción por color y talla.',pt:'Detalhe primeiro a rececao por cor e tamanho.',tr:'Once kabulu renk ve bedene gore ayrintilayin.'})}
                                className="px-4 py-2 rounded-xl text-xs font-bold transition-all border bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                              >
                                {tx(lang,{fr:'Ventiler',ar:'فصّل',en:'Itemise',es:'Desglosar',pt:'Desdobrar',tr:'Ayrintila'})}
                              </button>
                            ) : (
                              <button
                                disabled={item.remainingStock <= 0}
                                onClick={() => openSortieModal(item.model, item.salePrice)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm dark:shadow-none ${
                                  item.remainingStock > 0
                                    ? 'bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent/90 text-white hover:scale-[1.02]'
                                    : 'bg-slate-100 dark:bg-dk-elevated text-slate-400 dark:text-dk-muted cursor-not-allowed border border-slate-200 dark:border-dk-border'
                                }`}
                              >
                                {tx(lang,{fr:'Sortie Facture',ar:'إخراج فاتورة',en:'Issue Invoice',es:'Emitir Factura',pt:'Emitir Fatura',tr:'Fatura Kes'})}
                              </button>
                            )}
                          </td>
                        </tr>
                        {isStockDetailOpen(item.model.id) && (() => {
                          const fiche: any = item.model.ficheData || {};
                          const colors: Array<{ id: string; name: string }> = fiche.colors || [];
                          const sizes: string[] = fiche.sizes || [];
                          const matrix = stockMatrixByModel.get(item.model.id) || new Map<string, number>();
                          const at = (c: string, t: string) => matrix.get(`${c}|${t}`) || 0;
                          const hasGrid = colors.length > 0 && sizes.length > 0;
                          return (
                            <tr key={`${item.model.id}-detail`} className="bg-slate-50/60 dark:bg-dk-bg/40">
                              <td colSpan={5} className="px-6 py-4">
                                {/* Deux impasses différentes, deux messages différents :
                                    « pas de grille » se règle dans la fiche de coût,
                                    « grille vide » se règle par la réception détaillée. */}
                                {!hasGrid ? (
                                  <p className="text-[11px] text-slate-400 dark:text-dk-muted italic">
                                    {tx(lang,{fr:"Ce modèle n'a ni couleurs ni tailles : le stock reste un total global.",ar:'هاد الموديل ما عندو لا ألوان لا مقاسات: المخزون يبقى مجموعاً عامّاً.',en:'This model has no colors or sizes: stock stays a global total.',es:'Este modelo no tiene colores ni tallas: el stock es un total global.',pt:'Este modelo nao tem cores nem tamanhos: o stock e um total global.',tr:'Bu modelin rengi veya bedeni yok: stok genel toplam kalir.'})}
                                  </p>
                                ) : item.stockSource === 'FALLBACK' ? (
                                  <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400 font-semibold leading-relaxed">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>
                                      {tx(lang,{
                                        fr:`Les ${item.remainingStock} pièces ont été comptabilisées globalement, sans détail par couleur ni taille. Saisissez la réception détaillée dans l'onglet Commandes : sans elle, aucune sortie de stock n'est possible.`,
                                        ar:`${item.remainingStock} قطعة تسجّلات بشكل إجمالي، بلا تفصيل باللون ولا المقاس. دخّل الاستلام المفصّل ف علامة الطلبيات: بلاه، ما يمكن حتّى إخراج من المخزون.`,
                                        en:`The ${item.remainingStock} pieces were counted globally, with no breakdown by color or size. Enter the detailed reception in the Orders tab: without it, no stock exit is possible.`,
                                        es:`Las ${item.remainingStock} piezas se contabilizaron globalmente, sin desglose por color ni talla. Introduzca la recepción detallada en la pestaña Pedidos: sin ella, no es posible ninguna salida de stock.`,
                                        pt:`As ${item.remainingStock} pecas foram contabilizadas globalmente, sem desdobramento por cor ou tamanho. Introduza a rececao detalhada no separador Encomendas: sem ela, nenhuma saida de stock e possivel.`,
                                        tr:`${item.remainingStock} parca renk veya beden ayrimi olmadan toplu sayildi. Detayli kabulu Siparisler sekmesinde girin: onsuz hicbir stok cikisi mumkun degil.`
                                      })}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-[11px]">
                                      <thead className="text-slate-400 dark:text-dk-muted uppercase text-[9px] border-b border-slate-200 dark:border-dk-border">
                                        <tr>
                                          <th className="px-2 py-1.5 text-left font-medium">{tx(lang,{fr:'Couleur',ar:'اللون',en:'Color',es:'Color',pt:'Cor',tr:'Renk'})}</th>
                                          {sizes.map(sz => <th key={sz} className="px-2 py-1.5 text-center font-medium">{sz}</th>)}
                                          <th className="px-2 py-1.5 text-right font-medium">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                        {colors.map(c => {
                                          const rowTotal = sizes.reduce((a, sz) => a + at(c.name, sz), 0);
                                          return (
                                            <tr key={c.id}>
                                              <td className="px-2 py-1.5 font-bold text-slate-700 dark:text-dk-text-soft whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1.5"><ColorDot hex={colorHexOf(c.name)} />{c.name}</span>
                                              </td>
                                              {sizes.map(sz => {
                                                const q = at(c.name, sz);
                                                return (
                                                  <td key={sz} className={`px-2 py-1.5 text-center font-semibold ${q > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-300 dark:text-dk-muted'}`}>
                                                    {q || '—'}
                                                  </td>
                                                );
                                              })}
                                              <td className="px-2 py-1.5 text-right font-bold text-slate-700 dark:text-dk-text-soft">{rowTotal || '—'}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                      <tfoot className="border-t border-slate-200 dark:border-dk-border">
                                        <tr>
                                          <td className="px-2 py-1.5 font-bold uppercase text-[9px] text-slate-500 dark:text-dk-muted">Total</td>
                                          {sizes.map(sz => {
                                            const t = colors.reduce((a, c) => a + at(c.name, sz), 0);
                                            return <td key={sz} className="px-2 py-1.5 text-center font-bold text-slate-600 dark:text-dk-text-soft">{t || '—'}</td>;
                                          })}
                                          <td className="px-2 py-1.5 text-right font-extrabold text-indigo-600 dark:text-dk-accent">
                                            {colors.reduce((a, c) => a + sizes.reduce((b, sz) => b + at(c.name, sz), 0), 0) || '—'}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })()}
                        </React.Fragment>
                      ))}
                    </tbody>
                    {filteredStockStats.length > 0 && (
                      <tfoot className="bg-slate-50 dark:bg-dk-bg border-t border-slate-200 dark:border-dk-border text-slate-700 dark:text-dk-text">
                        {/* Cinq colonnes dans le corps, cinq colonnes ici : un pied
                            qui n'aligne pas ses colSpan sur l'en-tête laisse le
                            navigateur recalculer des largeurs incohérentes entre
                            thead/tbody/tfoot — d'où l'espace vide et les totaux
                            décalés que ce correctif supprime. */}
                        <tr className="font-bold text-xs">
                          <td className="px-6 py-3 uppercase text-[10px] text-slate-500 dark:text-dk-muted" colSpan={2}>
                            {tx(lang,{fr:'Total',ar:'المجموع',en:'Total',es:'Total',pt:'Total',tr:'Toplam'})} ({filteredStockStats.length})
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            {stockTotals.produced.toLocaleString(dateLocale)}
                            {' → '}{stockTotals.exited.toLocaleString(dateLocale)}
                            {' → '}{stockTotals.invoiced.toLocaleString(dateLocale)}
                            {' → '}{stockTotals.remaining.toLocaleString(dateLocale)}
                          </td>
                          <td className="px-6 py-3">
                            {canSeeCostHere
                              ? `${tx(lang,{fr:'Valeur (revient)',ar:'القيمة (بالتكلفة)',en:'Value (cost)',es:'Valor (coste)',pt:'Valor (custo)',tr:'Deger (maliyet)'})} : ${fmt(stockTotals.value)} ${currency}`
                              : '—'}
                          </td>
                          <td className="px-6 py-3" />
                        </tr>
                      </tfoot>
                    )}
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
                onClick={() => {
                  setIsChoiceModalOpen(false);
                  if (onCreateNewProject) onCreateNewProject();
                  else onNavigate?.('library');
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
        <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] z-[200] flex items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="relative my-auto bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-surface/50">
              <h2 className="font-bold text-slate-800 dark:text-dk-text text-base flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600 dark:text-dk-accent" />
                <span>{tx(lang,{fr:'Nouvelle Commande de Sous-traitance',ar:'أمر مقاولة من الباطن جديد',en:'New Subcontract Order',es:'Nuevo Pedido de Subcontratación',pt:'Nova Encomenda de Subcontratação',tr:'Yeni Taşeron Siparişi'})}</span>
              </h2>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddOrder} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-600 dark:text-dk-text-soft">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ModelPickerField
                  lang={lang}
                  models={models}
                  value={formModelId}
                  open={isModelPickerOpen}
                  setOpen={setIsModelPickerOpen}
                  onSelect={handleModelChange}
                />

                {Object.keys(batches[0].grid).length === 0 && (
                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Quantité *',ar:'الكمية *',en:'Quantity *',es:'Cantidad *',pt:'Quantidade *',tr:'Miktar *'})}</label>
                    <input
                      type="number"
                      value={formTotalQuantity || ''}
                      onChange={(e) => setFormTotalQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
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
                      <span className="font-bold text-indigo-600 dark:text-dk-accent-text">{effectiveTotalQuantity.toLocaleString()} pcs</span>
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
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
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

              <CoupeLocationField lang={lang} value={formCoupeLocation} onChange={setFormCoupeLocation} />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Tarif par pièce (MAD)',ar:'سعر القطعة (MAD)',en:'Price per piece (MAD)',es:'Precio por pieza (MAD)',pt:'Preço por peça (MAD)',tr:'Birim fiyat (MAD)'})}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formPricePerPiece || ''}
                    onChange={(e) => setFormPricePerPiece(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Total (MAD)',ar:'المجموع (MAD)',en:'Total (MAD)',es:'Total (MAD)',pt:'Total (MAD)',tr:'Toplam (MAD)'})}</label>
                  <div className="w-full bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text font-bold">
                    {/* `effectiveTotalQuantity` et non `formTotalQuantity` : dès qu'une
                        grille couleur × taille existe, la saisie manuelle est masquée
                        et c'est la grille qui fait foi — sinon le total restait à 0. */}
                    {(effectiveTotalQuantity * formPricePerPiece).toLocaleString()} MAD
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end border-t border-slate-200 dark:border-dk-border pt-4 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated text-slate-500 dark:text-dk-muted rounded-xl font-bold transition-all"
                >
                  {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent/90 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md dark:shadow-dk-md flex items-center gap-2 border border-indigo-500 dark:border-dk-accent/50"
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
        <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] z-[200] flex items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="relative my-auto bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-surface/50">
              <h2 className="font-bold text-slate-800 dark:text-dk-text text-base flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-600 dark:text-dk-accent" />
                <span>{tx(lang,{fr:'Modifier la Commande de Sous-traitance',ar:'تعديل أمر المقاولة من الباطن',en:'Edit Subcontract Order',es:'Editar Pedido de Subcontratación',pt:'Editar Encomenda de Subcontratação',tr:'Taşeron Siparişini Düzenle'})}</span>
              </h2>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditOrder} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-600 dark:text-dk-text-soft">
              {(
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ModelPickerField
                      lang={lang}
                      models={models}
                      value={formModelId}
                      open={isEditModelPickerOpen}
                      setOpen={setIsEditModelPickerOpen}
                      onSelect={handleModelChange}
                      locked
                    />

                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Nom du Client',ar:'اسم العميل',en:'Client Name',es:'Nombre del Cliente',pt:'Nome do Cliente',tr:'Müşteri Adı'})}</label>
                      <input 
                        type="text" 
                        value={formClientName} 
                        onChange={(e) => setFormClientName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
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
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
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
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
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
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
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
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
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
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1.5 col-span-2 md:col-span-1">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">{tx(lang,{fr:'Note / Instruction',ar:'ملاحظة / تعليمات',en:'Note / Instruction',es:'Nota / Instrucción',pt:'Nota / Instrução',tr:'Not / Talimat'})}</label>
                      <input 
                        type="text" 
                        value={formNotes} 
                        onChange={(e) => setFormNotes(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
                        placeholder={tx(lang,{fr:'Détails logistiques...',ar:'تفاصيل لوجستية...',en:'Logistics details...',es:'Detalles logísticos...',pt:'Detalhes logísticos...',tr:'Lojistik detaylar...'})}
                      />
                    </div>
                  </div>

                  <CoupeLocationField lang={lang} value={formCoupeLocation} onChange={setFormCoupeLocation} />

                  {/* Grid matrix colors & sizes */}
                  <div className="border border-slate-200 dark:border-dk-border rounded-2xl p-4 bg-slate-50 dark:bg-dk-surface/50 space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <span className="font-bold text-slate-800 dark:text-dk-text">{tx(lang,{fr:'Matrice Couleur - Taille (Facultatif)',ar:'مصفوفة اللون - المقاس (اختياري)',en:'Color - Size Matrix (Optional)',es:'Matriz Color - Talla (Opcional)',pt:'Matriz Cor - Tamanho (Opcional)',tr:'Renk - Beden Matrisi (İsteğe Bağlı)'})}</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          placeholder={tx(lang,{fr:'Ajouter couleur',ar:'إضافة لون',en:'Add color',es:'Añadir color',pt:'Adicionar cor',tr:'Renk ekle'})} 
                          value={newColorInput} 
                          onChange={(e) => setNewColorInput(e.target.value)}
                          className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-1 text-[11px] outline-none text-slate-800 dark:text-dk-text focus:border-indigo-500 dark:focus:border-dk-accent"
                        />
                        <button 
                          type="button" 
                          onClick={handleAddColor}
                          className="bg-indigo-600 dark:bg-dk-accent text-white px-3 py-1 rounded-lg hover:bg-indigo-700 dark:hover:bg-dk-accent/90 font-bold transition-all text-[11px]"
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
                                      className="w-12 text-center bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border rounded p-1 text-xs focus:border-indigo-500 dark:focus:border-dk-accent outline-none"
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

              {/* Matières & Fournisseurs à prévoir — mode Façon uniquement, éditable ici */}
              {formTissuFournisseur !== 'SUBCONTRACTOR' && (() => {
                const rows = getFaconMaterialsNeeds(
                  { modelId: formModelId, totalQuantity: effectiveTotalQuantity },
                  formMaterialsFournisseur
                );
                if (!rows.length) return null;
                return (
                  <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border">
                      <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">{tx(lang,{fr:'Matières & fournisseurs à prévoir',ar:'المواد والموردون المطلوبون',en:'Materials & suppliers to plan',es:'Materiales y proveedores a prever',pt:'Materiais e fornecedores a prever',tr:'Öngörülecek malzeme ve tedarikçiler'})}</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="bg-white dark:bg-dk-surface text-slate-400 dark:text-dk-muted uppercase tracking-wide text-[9px] border-b border-slate-100 dark:border-dk-border">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium">{tx(lang,{fr:'Matière',ar:'المادة',en:'Material',es:'Material',pt:'Material',tr:'Malzeme'})}</th>
                            <th className="px-4 py-2 text-center font-medium">{tx(lang,{fr:'Besoin',ar:'الاحتياج',en:'Need',es:'Necesidad',pt:'Necessidade',tr:'İhtiyaç'})}</th>
                            <th className="px-4 py-2 text-center font-medium">{tx(lang,{fr:'Manque',ar:'النقص',en:'Shortage',es:'Déficit',pt:'Falta',tr:'Eksiklik'})}</th>
                            <th className="px-4 py-2 text-left font-medium">{tx(lang,{fr:'Fournisseur',ar:'المورد',en:'Supplier',es:'Proveedor',pt:'Fornecedor',tr:'Tedarikçi'})}</th>
                            <th className="px-4 py-2 text-right font-medium">{tx(lang,{fr:'Total',ar:'المجموع',en:'Total',es:'Total',pt:'Total',tr:'Toplam'})}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                          {rows.map(r => (
                            <tr key={r.id}>
                              <td className="px-4 py-2 font-semibold text-slate-700 dark:text-dk-text-soft">
                                <span className="inline-flex items-center gap-1.5">
                                  {materialPhotoOf(r.name)
                                    ? <img src={materialPhotoOf(r.name)} alt="" className="w-5 h-5 rounded object-cover border border-slate-200 dark:border-dk-border shrink-0" />
                                    : <Package className="w-3.5 h-3.5 text-slate-300 dark:text-dk-muted shrink-0" />}
                                  {r.name}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center">{fmt(r.buyQty)} {r.unit}</td>
                              <td className={`px-4 py-2 text-center font-bold ${r.manque > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-300 dark:text-dk-muted'}`}>{fmt(r.manque)} {r.unit}</td>
                              <td className="px-4 py-1.5">
                                <input
                                  type="text"
                                  value={formMaterialsFournisseur[r.name] ?? ''}
                                  onChange={(e) => setFormMaterialsFournisseur(prev => ({ ...prev, [r.name]: e.target.value }))}
                                  placeholder={r.fournisseur || tx(lang,{fr:'Nom du fournisseur',ar:'اسم المورد',en:'Supplier name',es:'Nombre del proveedor',pt:'Nome do fornecedor',tr:'Tedarikçi adı'})}
                                  className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1.5 text-[11px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                                />
                              </td>
                              <td className="px-4 py-2 text-right font-bold text-slate-700 dark:text-dk-text-soft">
                                {fmt(r.cost)} MAD
                                <MaterialPriceBadge source={r.priceSource} lang={lang} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-3 justify-between items-center border-t border-slate-200 dark:border-dk-border pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setOrderPendingDelete(selectedOrder)}
                  className="px-4 py-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-rose-200 dark:hover:border-rose-800/50"
                >
                  {tx(lang,{fr:'Supprimer la commande',ar:'حذف الطلبية',en:'Delete order',es:'Eliminar pedido',pt:'Eliminar encomenda',tr:'Siparişi sil'})}
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-5 py-2.5 border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated text-slate-500 dark:text-dk-muted rounded-xl font-bold transition-all"
                  >
                    {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent/90 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md dark:shadow-dk-md flex items-center gap-2 border border-indigo-500 dark:border-dk-accent/50"
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
      {/* CONFIRMATION DE SUPPRESSION DE COMMANDE */}
      {/* ======================================= */}
      {orderPendingDelete && createPortal(
        <div className="fixed inset-0 bg-slate-950/30 dark:bg-dk-bg/50 backdrop-blur-[2px] flex items-center justify-center z-[500] p-4">
          <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-2xl shadow-2xl dark:shadow-dk-elevated w-full max-w-md p-6 text-slate-700 dark:text-dk-text">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-800 dark:text-dk-text text-sm">
                  {tx(lang,{fr:'Supprimer cette commande ?',ar:'حذف هذه الطلبية؟',en:'Delete this order?',es:'¿Eliminar este pedido?',pt:'Eliminar esta encomenda?',tr:'Bu sipariş silinsin mi?'})}
                </h3>
                <p className="text-xs text-slate-500 dark:text-dk-muted mt-1.5 leading-relaxed">
                  {tx(lang,{fr:'Cette action est definitive. Le journal des entrees/sorties et les frais lies seront egalement supprimes.',ar:'هذا الإجراء نهائي. سيتم كذلك حذف سجل الإدخال/الإخراج والمصاريف المرتبطة.',en:'This action is permanent. The entry/exit journal and related expenses will also be deleted.',es:'Esta accion es definitiva. El diario de entradas/salidas y los gastos vinculados tambien se eliminaran.',pt:'Esta acao e definitiva. O diario de entradas/saidas e as despesas associadas tambem serao eliminados.',tr:'Bu islem kalicidir. Giris/cikis kaydi ve ilgili masraflar da silinecek.'})}
                </p>
                <div className="mt-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-dk-bg/50 border border-slate-200 dark:border-dk-border text-xs">
                  <span className="font-bold text-slate-700 dark:text-dk-text">{orderPendingDelete.modelName || orderPendingDelete.modelId}</span>
                  <span className="text-slate-400 dark:text-dk-muted"> · {orderPendingDelete.subcontractorName} · {orderPendingDelete.totalQuantity} pcs</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button
                type="button"
                disabled={isDeletingOrder}
                onClick={() => setOrderPendingDelete(null)}
                className="px-5 py-2.5 border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-slate-500 dark:text-dk-muted rounded-xl font-bold text-xs transition-all disabled:opacity-50"
              >
                {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
              </button>
              <button
                type="button"
                disabled={isDeletingOrder}
                onClick={confirmDeleteOrder}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-all shadow-md flex items-center gap-2 disabled:opacity-60"
              >
                {isDeletingOrder && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{tx(lang,{fr:'Supprimer',ar:'حذف',en:'Delete',es:'Eliminar',pt:'Eliminar',tr:'Sil'})}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ======================================= */}
      {/* DETAILED VIEW MODAL */}
      {/* ======================================= */}
      {/* Confirmation d'un jalon logistique — la pastille reste le contrôle, mais
          le basculement n'est plus produit par le seul clic. */}
      {milestoneConfirm && (() => {
        const { order, field, isOn } = milestoneConfirm;
        const name =
          field === 'tissuStatus' ? tx(lang,{fr:'Tissu',ar:'القماش',en:'Fabric',es:'Tejido',pt:'Tecido',tr:'Kumaş'})
          : field === 'fournituresStatus' ? tx(lang,{fr:'Fournitures',ar:'اللوازم',en:'Trims',es:'Avíos',pt:'Aviamentos',tr:'Aksesuar'})
          : field === 'ficheTechniqueSent' ? tx(lang,{fr:'Fiche technique',ar:'البطاقة التقنية',en:'Tech pack',es:'Ficha técnica',pt:'Ficha técnica',tr:'Teknik föy'})
          : tx(lang,{fr:'Prototype',ar:'النموذج الأولي',en:'Prototype',es:'Prototipo',pt:'Protótipo',tr:'Prototip'});
        const question = isOn
          ? tx(lang,{fr:`Repasser « ${name} » en attente ?`,ar:`ترجاع «${name}» للانتظار؟`,en:`Set “${name}” back to pending?`,es:`¿Volver a poner «${name}» en espera?`,pt:`Voltar “${name}” a pendente?`,tr:`“${name}” tekrar beklemeye alınsın mı?`})
          : tx(lang,{fr:`Confirmer « ${name} » comme fait ?`,ar:`تأكيد «${name}» كمُنجَز؟`,en:`Confirm “${name}” as done?`,es:`¿Confirmar «${name}» como hecho?`,pt:`Confirmar “${name}” como feito?`,tr:`“${name}” tamamlandı olarak onaylansın mı?`});
        return createPortal(
          <div className="fixed inset-0 z-[240] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMilestoneConfirm(null)}>
            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-start gap-2.5">
                <ClipboardCheck className="w-4 h-4 text-indigo-600 dark:text-dk-accent shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-slate-800 dark:text-dk-text">{question}</p>
                  <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-1">
                    {order.modelName || order.modelId} — {order.subcontractorName}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMilestoneConfirm(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors"
                >
                  {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
                </button>
                <button
                  type="button"
                  onClick={() => { setMilestoneConfirm(null); applyToggleMilestone(order, field); }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 dark:bg-dk-accent text-white font-bold text-[11px] hover:bg-indigo-700 transition-colors"
                >
                  {tx(lang,{fr:'Confirmer',ar:'تأكيد',en:'Confirm',es:'Confirmar',pt:'Confirmar',tr:'Onayla'})}
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Entrées en stock : la saisie se fait sur la MÊME grille couleur x taille
          que la fiche du modèle, et chaque saisie reste consultable telle quelle. */}
      {stockEntryOrder && stockEntryMatrix && createPortal(
        <div className="fixed inset-0 z-[240] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setStockEntryOrder(null)}>
          <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border w-full max-w-3xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 h-12 border-b border-slate-100 dark:border-dk-border flex items-center justify-between sticky top-0 bg-white dark:bg-dk-surface z-10">
              <h3 className="text-[13px] font-bold text-slate-900 dark:text-dk-text flex items-center gap-2 min-w-0">
                <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate">
                  {tx(lang,{fr:'Entrées en stock',ar:'إدخالات المخزون',en:'Stock entries',es:'Entradas en stock',pt:'Entradas em stock',tr:'Stok girisleri'})}
                  {' — '}{stockEntryOrder.modelName || stockEntryOrder.modelId}
                </span>
              </h3>
              <button onClick={() => setStockEntryOrder(null)} className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Grille de saisie : chaque cellule affiche ce qu'il RESTE à recevoir
                  pour cette couleur et cette taille. Saisir en aveugle un total
                  global ne permettait pas de savoir quelles pièces manquaient. */}
              {stockEntryMatrix.colors.length === 0 || stockEntryMatrix.sizes.length === 0 ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                  {tx(lang,{fr:"Ce modèle n'a ni couleurs ni tailles : complétez sa grille dans la fiche de coût pour saisir le détail.",ar:'هاد الموديل ما عندو لا ألوان لا مقاسات: كمّل الشبكة ديالو ف بطاقة التكلفة باش تدخّل التفصيل.',en:'This model has no colors or sizes: complete its grid in the cost sheet to record details.',es:'Este modelo no tiene colores ni tallas: complete su rejilla en la ficha de coste.',pt:'Este modelo não tem cores nem tamanhos: complete a grelha na ficha de custo.',tr:'Bu modelin rengi veya bedeni yok: ayrinti girmek icin maliyet kartindaki izgarayi tamamlayin.'})}
                </p>
              ) : (
                <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">
                      {tx(lang,{fr:'Nouvelle entrée',ar:'إدخال جديد',en:'New entry',es:'Nueva entrada',pt:'Nova entrada',tr:'Yeni giris'})}
                    </h4>
                    <div className="flex items-center gap-2">
                      {/* Le sélecteur porte la couleur de la qualité choisie : c'est
                          elle qui décide si les pièces entrent au stock vendable,
                          et un mauvais choix passait inaperçu sur un menu neutre. */}
                      <select
                        value={entryQualite}
                        onChange={e => setEntryQualite(e.target.value as any)}
                        className={`border rounded-lg px-2 py-1 text-[10px] font-bold outline-none transition-colors ${
                          entryQualite === 'ACCEPTED'
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400'
                            : entryQualite === 'REPAIR'
                              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/60 text-amber-700 dark:text-amber-400'
                              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900/60 text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        <option value="ACCEPTED" style={{ color: '#047857' }}>{tx(lang,{fr:'Acceptées',ar:'مقبولة',en:'Accepted',es:'Aceptadas',pt:'Aceites',tr:'Kabul'})}</option>
                        <option value="REPAIR" style={{ color: '#b45309' }}>{tx(lang,{fr:'À retoucher',ar:'قيد التعديل',en:'To rework',es:'Por retocar',pt:'Por retocar',tr:'Rotus'})}</option>
                        <option value="REJECTED" style={{ color: '#be123c' }}>{tx(lang,{fr:'Rejetées',ar:'مرفوضة',en:'Rejected',es:'Rechazadas',pt:'Rejeitadas',tr:'Red'})}</option>
                      </select>
                      <input
                        type="date"
                        value={entryDate}
                        onChange={e => setEntryDate(e.target.value)}
                        className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1 text-[10px] font-bold text-slate-700 dark:text-dk-text-soft outline-none"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-white dark:bg-dk-surface text-slate-400 dark:text-dk-muted uppercase text-[9px] border-b border-slate-100 dark:border-dk-border">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">{tx(lang,{fr:'Couleur \\ Taille',ar:'اللون \\ المقاس',en:'Color \\ Size',es:'Color \\ Talla',pt:'Cor \\ Tamanho',tr:'Renk \\ Beden'})}</th>
                          {stockEntryMatrix.sizes.map(sz => (
                            <th key={sz} className="px-2 py-2 text-center font-medium">{sz}</th>
                          ))}
                          <th className="px-3 py-2 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                        {stockEntryMatrix.colors.map(c => {
                          const rowTotal = stockEntryMatrix.sizes.reduce((a, sz) => a + (Number(entryGrid[gridKey(c.name, sz)]) || 0), 0);
                          return (
                            <tr key={c.id}>
                              <td className="px-3 py-1.5 font-bold text-slate-700 dark:text-dk-text-soft whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><ColorDot hex={colorHexOf(c.name)} />{c.name}</span></td>
                              {stockEntryMatrix.sizes.map(sz => {
                                const k = gridKey(c.name, sz);
                                const commande = stockEntryMatrix.commande[k] || 0;
                                const entre = stockEntryMatrix.entre[k] || 0;
                                const reste = Math.max(0, commande - entre);
                                return (
                                  <td key={sz} className="px-1 py-1.5 text-center">
                                    <input
                                      type="number"
                                      min={0}
                                      max={reste || undefined}
                                      value={entryGrid[k] ?? ''}
                                      placeholder={commande > 0 ? String(reste) : '—'}
                                      disabled={commande === 0}
                                      onChange={e => setEntryGrid(prev => ({
                                        ...prev,
                                        [k]: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0),
                                      }))}
                                      title={commande > 0
                                        ? `${tx(lang,{fr:'Commandé',ar:'المطلوب',en:'Ordered',es:'Pedido',pt:'Encomendado',tr:'Siparis'})} ${commande} · ${tx(lang,{fr:'entré',ar:'مُدخَل',en:'entered',es:'entrado',pt:'entrado',tr:'girilen'})} ${entre} · ${tx(lang,{fr:'reste',ar:'المتبقي',en:'remaining',es:'resta',pt:'resta',tr:'kalan'})} ${reste}`
                                        : tx(lang,{fr:'Non commandé dans cette taille',ar:'ما مطلوبش ف هاد المقاس',en:'Not ordered in this size',es:'No pedido en esta talla',pt:'Nao encomendado neste tamanho',tr:'Bu bedende siparis edilmedi'})}
                                      className={`w-14 text-center rounded-lg px-1 py-1 text-[11px] outline-none border ${
                                        commande === 0
                                          ? 'bg-slate-50 dark:bg-dk-bg/40 border-transparent text-slate-300 dark:text-dk-muted'
                                          : reste === 0
                                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400'
                                            : 'bg-slate-50 dark:bg-dk-bg border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text focus:border-indigo-500 dark:focus:border-dk-accent'
                                      }`}
                                    />
                                  </td>
                                );
                              })}
                              <td className="px-3 py-1.5 text-right font-bold text-slate-700 dark:text-dk-text-soft">{rowTotal || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 dark:bg-dk-bg/60 border-t border-slate-200 dark:border-dk-border">
                        <tr>
                          <td className="px-3 py-2 font-bold uppercase text-[9px] text-slate-500 dark:text-dk-muted">Total</td>
                          {stockEntryMatrix.sizes.map(sz => {
                            const colTotal = stockEntryMatrix.colors.reduce((a, c) => a + (Number(entryGrid[gridKey(c.name, sz)]) || 0), 0);
                            return <td key={sz} className="px-2 py-2 text-center font-bold text-slate-600 dark:text-dk-text-soft">{colTotal || '—'}</td>;
                          })}
                          <td className="px-3 py-2 text-right font-extrabold text-indigo-600 dark:text-dk-accent">
                            {Object.values(entryGrid).reduce((a: number, v) => a + (Number(v) || 0), 0) || '—'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="px-4 py-3 border-t border-slate-100 dark:border-dk-border flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-[10px] text-slate-500 dark:text-dk-muted">
                      {tx(lang,{fr:'Le gris clair dans chaque case indique ce qui reste à recevoir. Seules les pièces ACCEPTÉES entrent au stock vendable.',ar:'الرقم الرمادي ف كل خانة كيبيّن المتبقي. غير القطع المقبولة كتدخل للمخزون القابل للبيع.',en:'The grey number in each cell shows what remains to receive. Only ACCEPTED pieces enter sellable stock.',es:'El numero gris de cada celda indica lo que falta recibir. Solo las piezas ACEPTADAS entran en el stock vendible.',pt:'O numero cinzento em cada celula mostra o que falta receber. So as pecas ACEITES entram no stock vendavel.',tr:'Her hucredeki gri sayi alinacak kalani gosterir. Yalnizca KABUL edilen parcalar satilabilir stoga girer.'})}
                    </p>
                    {/* Clôture : le stock est complet et la prestation finie. */}
                    <button
                      type="button"
                      onClick={() => setFinishForm({ order: stockEntryOrder, rating: stockEntryOrder.subcontractorRating || 5 })}
                      disabled={stockEntrySaving || stockEntryOrder.status === 'COMPLETED'}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors disabled:opacity-40"
                        title={stockEntryOrder.status === 'COMPLETED'
                          ? tx(lang,{fr:'Commande déjà clôturée',ar:'الأمر مُغلق سلفاً',en:'Order already closed',es:'Pedido ya cerrado',pt:'Encomenda já fechada',tr:'Sipariş zaten kapatıldı'})
                          : tx(lang,{fr:'Tout est entré en stock, le sous-traitant a fini',ar:'كلشي دخل للمخزون، السوطراطور سالا',en:'Everything is in stock, the subcontractor is done',es:'Todo está en stock, el subcontratista terminó',pt:'Tudo em stock, o subcontratado terminou',tr:'Her şey stokta, taşeron bitirdi'})}
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        {tx(lang,{fr:'Terminer la commande',ar:'إنهاء الأمر',en:'Close the order',es:'Cerrar el pedido',pt:'Fechar a encomenda',tr:'Siparişi kapat'})}
                    </button>
                    <button
                      type="button"
                      onClick={addStockEntry}
                      disabled={stockEntrySaving}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 transition-colors disabled:opacity-40"
                    >
                      {stockEntrySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      {tx(lang,{fr:"Ajouter l'entrée",ar:'إضافة الإدخال',en:'Add entry',es:'Anadir entrada',pt:'Adicionar entrada',tr:'Giris ekle'})}
                    </button>
                  </div>

                  {stockEntryError && (
                    <p className="px-4 pb-3 text-[10px] font-semibold text-rose-600 dark:text-rose-400">{stockEntryError}</p>
                  )}
                </div>
              )}

              {/* Historique : chaque saisie est réaffichée sous la forme du tableau
                  qu'elle était, et se supprime d'un bloc. */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide text-[10px]">
                  {tx(lang,{fr:'Historique des entrées',ar:'سجلّ الإدخالات',en:'Entry history',es:'Historial de entradas',pt:'Historico de entradas',tr:'Giris gecmisi'})}
                </h4>

                {stockEntriesLoading ? (
                  <div className="flex items-center gap-2 text-slate-400 dark:text-dk-muted text-[11px] font-semibold py-3">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{tx(lang,{fr:'Chargement…',ar:'جارٍ التحميل…',en:'Loading…',es:'Cargando…',pt:'A carregar…',tr:'Yukleniyor…'})}</span>
                  </div>
                ) : stockEntryBatches.length === 0 ? (
                  <p className="text-[11px] text-slate-400 dark:text-dk-muted italic">
                    {tx(lang,{fr:'Aucune entrée enregistrée pour cette commande.',ar:'ما كاين حتى إدخال مسجّل لهاد الأمر.',en:'No entry recorded for this order.',es:'Ninguna entrada registrada para este pedido.',pt:'Nenhuma entrada registada para esta encomenda.',tr:'Bu siparis icin kayitli giris yok.'})}
                  </p>
                ) : (
                  stockEntryBatches.map(batch => {
                    const couleurs = [...new Set(batch.lignes.map(l => l.couleur || '—'))];
                    const tailles = stockEntryMatrix.sizes.length > 0
                      ? stockEntryMatrix.sizes.filter(sz => batch.lignes.some(l => (l.taille || '—') === sz))
                      : [...new Set(batch.lignes.map(l => l.taille || '—'))];
                    const cell = (c: string, sz: string) =>
                      batch.lignes.filter(l => (l.couleur || '—') === c && (l.taille || '—') === sz)
                        .reduce((a, l) => a + (Number(l.quantite) || 0), 0);
                    return (
                      <div key={batch.id} className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                        <div className="px-4 py-2 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border flex items-center justify-between gap-2 flex-wrap">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${
                              batch.qualite === 'ACCEPTED' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
                              : batch.qualite === 'REPAIR' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'
                              : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/50'
                            }`}>
                              {batch.qualite === 'ACCEPTED' ? tx(lang,{fr:'Acceptées',ar:'مقبولة',en:'Accepted',es:'Aceptadas',pt:'Aceites',tr:'Kabul'})
                                : batch.qualite === 'REPAIR' ? tx(lang,{fr:'À retoucher',ar:'قيد التعديل',en:'To rework',es:'Por retocar',pt:'Por retocar',tr:'Rotus'})
                                : tx(lang,{fr:'Rejetées',ar:'مرفوضة',en:'Rejected',es:'Rechazadas',pt:'Rejeitadas',tr:'Red'})}
                            </span>
                            <span className="text-[10px] font-bold text-slate-600 dark:text-dk-text-soft">{batch.total.toLocaleString()} pcs</span>
                            <span className="text-[10px] text-slate-400 dark:text-dk-muted">{batch.date ? fmtDate(batch.date) : '—'}</span>
                          </span>
                          <button
                            type="button"
                            disabled={stockEntrySaving}
                            onClick={() => setBatchPendingDelete({ id: batch.id, total: batch.total, date: batch.date })}
                            title={tx(lang,{fr:'Supprimer cette entrée',ar:'حذف هاد الإدخال',en:'Delete this entry',es:'Eliminar esta entrada',pt:'Eliminar esta entrada',tr:'Bu girisi sil'})}
                            className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead className="text-slate-400 dark:text-dk-muted uppercase text-[9px] border-b border-slate-100 dark:border-dk-border">
                              <tr>
                                <th className="px-3 py-1.5 text-left font-medium">{tx(lang,{fr:'Couleur',ar:'اللون',en:'Color',es:'Color',pt:'Cor',tr:'Renk'})}</th>
                                {tailles.map(sz => <th key={sz} className="px-2 py-1.5 text-center font-medium">{sz}</th>)}
                                <th className="px-3 py-1.5 text-right font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                              {couleurs.map(c => (
                                <tr key={c}>
                                  <td className="px-3 py-1.5 font-bold text-slate-700 dark:text-dk-text-soft whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><ColorDot hex={colorHexOf(c)} />{c}</span></td>
                                  {tailles.map(sz => {
                                    const v = cell(c, sz);
                                    return <td key={sz} className={`px-2 py-1.5 text-center ${v ? 'font-bold text-slate-700 dark:text-dk-text-soft' : 'text-slate-300 dark:text-dk-muted'}`}>{v || '—'}</td>;
                                  })}
                                  <td className="px-3 py-1.5 text-right font-bold text-slate-700 dark:text-dk-text-soft">
                                    {tailles.reduce((a, sz) => a + cell(c, sz), 0).toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Sortie de stock : client du registre + grille couleur x taille. */}
      {sortieForm && createPortal(
        <div className="fixed inset-0 z-[245] flex items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSortieForm(null)}>
          <div className="bg-white dark:bg-dk-surface rounded-none sm:rounded-2xl border border-slate-200 dark:border-dk-border w-full max-w-none sm:max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 h-12 border-b border-slate-100 dark:border-dk-border flex items-center justify-between sticky top-0 bg-white dark:bg-dk-surface z-10">
              <h3 className="text-[13px] font-bold text-slate-900 dark:text-dk-text flex items-center gap-2 min-w-0">
                <Truck className="w-4 h-4 text-indigo-600 dark:text-dk-accent shrink-0" />
                <span className="truncate">
                  {tx(lang,{fr:'Sortie de stock',ar:'إخراج من المخزون',en:'Stock exit',es:'Salida de stock',pt:'Saida de stock',tr:'Stok cikisi'})}
                  {' — '}{sortieForm.model.meta_data?.nom_modele || sortieForm.model.id}
                </span>
              </h3>
              <button onClick={() => setSortieForm(null)} className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1">
                    {tx(lang,{fr:'Client',ar:'الزبون',en:'Client',es:'Cliente',pt:'Cliente',tr:'Musteri'})}
                  </label>
                  <select
                    value={sortieForm.clientId}
                    onChange={e => setSortieForm(prev => prev && ({ ...prev, clientId: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                  >
                    <option value="">{tx(lang,{fr:'— Aucun —',ar:'— بلا —',en:'— None —',es:'— Ninguno —',pt:'— Nenhum —',tr:'— Yok —'})}</option>
                    {atelierClients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nom}{c.type === 'GROS' ? ` · ${tx(lang,{fr:'Gros',ar:'الجملة',en:'Wholesale',es:'Mayorista',pt:'Grosso',tr:'Toptan'})}` : ''}
                      </option>
                    ))}
                  </select>
                  {atelierClients.length === 0 && (
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">
                      {tx(lang,{fr:"Aucun client enregistré — ajoutez-le dans l'onglet Clients.",ar:'ما كاين حتى زبون مسجّل — زيدو ف تبويب Clients.',en:'No client recorded — add one in the Clients tab.',es:'Ningun cliente registrado — anadalo en la pestana Clientes.',pt:'Nenhum cliente registado — adicione no separador Clientes.',tr:'Kayitli musteri yok — Musteriler sekmesinden ekleyin.'})}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1">
                    {tx(lang,{fr:'Prix unitaire',ar:'ثمن الوحدة',en:'Unit price',es:'Precio unitario',pt:'Preco unitario',tr:'Birim fiyat'})}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={sortieForm.prix}
                    onChange={e => setSortieForm(prev => prev && ({
                      ...prev,
                      prix: e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0),
                      // Dès la première frappe, le tarif résolu cesse de s'imposer.
                      prixTouched: true,
                    }))}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                  />
                  {/* PROVENANCE du prix. Un montant qui apparait sans qu'on sache
                      d'ou il vient n'est pas defendable devant un client. */}
                  <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-1 leading-snug">
                    {sortieTarifLoading
                      ? tx(lang,{fr:'Recherche du tarif…',ar:'كنقلّبو على التعريفة…',en:'Looking up the tariff…',es:'Buscando la tarifa…',pt:'A procurar o tarifario…',tr:'Tarife araniyor…'})
                      : sortieTarif?.source === 'CLIENT'
                        ? tx(lang,{fr:'Tarif négocié de ce client',ar:'تعريفة متفاوض عليها مع هاد الزبون',en:'Negotiated tariff for this client',es:'Tarifa negociada de este cliente',pt:'Tarifario negociado deste cliente',tr:'Bu musteriyle anlasilan tarife'})
                        : sortieTarif?.source === 'TYPE'
                          ? `${tx(lang,{fr:'Tarif',ar:'تعريفة',en:'Tariff',es:'Tarifa',pt:'Tarifario',tr:'Tarife'})} ${clientTypeLabels[String(sortieTarif?.type_client || '')] || String(sortieTarif?.type_client || '')}`
                          : sortieTarif?.source === 'CATALOGUE'
                            ? tx(lang,{fr:'Tarif catalogue',ar:'تعريفة الكاطالوݣ',en:'Catalogue tariff',es:'Tarifa de catálogo',pt:'Tarifario de catalogo',tr:'Katalog tarifesi'})
                            : tx(lang,{fr:'Aucun tarif — saisissez le prix',ar:'ما كاينة حتى تعريفة — دخّل الثمن',en:'No tariff — enter the price',es:'Ninguna tarifa — introduzca el precio',pt:'Sem tarifario — introduza o preco',tr:'Tarife yok — fiyati girin'})}
                    {sortieTarif?.qty_min != null && sortieTarif.qty_min > 0 && sortieTarif.source !== 'NONE' && (
                      <span>{' · '}{tx(lang,{fr:'palier',ar:'العتبة',en:'tier',es:'tramo',pt:'escalao',tr:'kademe'})} ≥ {sortieTarif.qty_min}</span>
                    )}
                  </p>
                  {/* Le tarif reste une PROPOSITION dès que l'opérateur a saisi
                      son propre prix : on l'offre, on ne l'impose pas. */}
                  {sortieForm.prixTouched && sortieTarif?.prix != null && Number(sortieForm.prix) !== sortieTarif.prix && (
                    <button
                      type="button"
                      onClick={() => setSortieForm(prev => prev && ({ ...prev, prix: Number((sortieTarif.prix as number).toFixed(2)) }))}
                      className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 dark:border-dk-accent/50 text-indigo-600 dark:text-dk-accent text-[10px] font-bold hover:bg-indigo-50 dark:hover:bg-dk-elevated transition-colors"
                    >
                      {tx(lang,{fr:'Appliquer le tarif',ar:'طبّق التعريفة',en:'Apply the tariff',es:'Aplicar la tarifa',pt:'Aplicar o tarifario',tr:'Tarifeyi uygula'})} : {fmt(sortieTarif.prix)} {currency}
                    </button>
                  )}
                </div>
                <div>
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1">
                    {tx(lang,{fr:'Date',ar:'التاريخ',en:'Date',es:'Fecha',pt:'Data',tr:'Tarih'})}
                  </label>
                  <input
                    type="date"
                    value={sortieForm.date}
                    onChange={e => setSortieForm(prev => prev && ({ ...prev, date: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                  />
                </div>
              </div>

              {/* Grille : chaque case indique en gris le stock DISPONIBLE pour cette
                  couleur et cette taille — on ne peut pas sortir ce qui n'existe pas. */}
              {(() => {
                const fiche: any = sortieForm.model.ficheData || {};
                const colors: Array<{ id: string; name: string }> = fiche.colors || [];
                const sizes: string[] = fiche.sizes || [];
                const matrix = stockMatrixByModel.get(sortieForm.model.id) || new Map<string, number>();
                const dispo = (c: string, t: string) => matrix.get(`${c}|${t}`) || 0;
                if (colors.length === 0 || sizes.length === 0) {
                  return (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                      {tx(lang,{fr:"Ce modèle n'a ni couleurs ni tailles : complétez sa grille dans la fiche de coût.",ar:'هاد الموديل ما عندو لا ألوان لا مقاسات: كمّل الشبكة ف بطاقة التكلفة.',en:'This model has no colors or sizes: complete its grid in the cost sheet.',es:'Este modelo no tiene colores ni tallas: complete su rejilla en la ficha de coste.',pt:'Este modelo nao tem cores nem tamanhos: complete a grelha na ficha de custo.',tr:'Bu modelin rengi veya bedeni yok: maliyet kartindaki izgarayi tamamlayin.'})}
                    </p>
                  );
                }
                const totalSortie: number = Object.values(sortieForm.grid).reduce<number>((a, v) => a + (Number(v) || 0), 0);
                return (
                  <div className="relative border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                    {/* Même aveu qu'ailleurs : sur un modèle à six tailles, S à XL
                        tient dans 390px mais XX et XXXL restent hors champ — le
                        dégradé dit qu'il faut glisser au lieu de laisser croire
                        que la grille s'arrête à XL. */}
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white dark:from-dk-surface to-transparent sm:hidden z-10" aria-hidden="true" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-50 dark:bg-dk-bg/60 text-slate-400 dark:text-dk-muted uppercase text-[9px] border-b border-slate-200 dark:border-dk-border">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">{tx(lang,{fr:'Couleur',ar:'اللون',en:'Color',es:'Color',pt:'Cor',tr:'Renk'})}</th>
                            {sizes.map(sz => <th key={sz} className="px-2 py-2 text-center font-medium">{sz}</th>)}
                            <th className="px-3 py-2 text-right font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                          {colors.map(c => {
                            const rowTotal = sizes.reduce((a, sz) => a + (Number(sortieForm.grid[`${c.name}|${sz}`]) || 0), 0);
                            return (
                              <tr key={c.id}>
                                <td className="px-3 py-1.5 font-bold text-slate-700 dark:text-dk-text-soft whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1.5"><ColorDot hex={colorHexOf(c.name)} />{c.name}</span>
                                </td>
                                {sizes.map(sz => {
                                  const k = `${c.name}|${sz}`;
                                  const d = dispo(c.name, sz);
                                  return (
                                    <td key={sz} className="px-1 py-1.5 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        max={d}
                                        disabled={d <= 0}
                                        placeholder={d > 0 ? String(d) : '—'}
                                        value={sortieForm.grid[k] ?? ''}
                                        onChange={e => setSortieForm(prev => prev && ({
                                          ...prev,
                                          grid: { ...prev.grid, [k]: e.target.value === '' ? '' : Math.min(d, Math.max(0, parseInt(e.target.value) || 0)) },
                                        }))}
                                        title={`${tx(lang,{fr:'Disponible',ar:'المتوفّر',en:'Available',es:'Disponible',pt:'Disponivel',tr:'Mevcut'})} : ${d}`}
                                        className={`w-14 text-center rounded-lg px-1 py-1 text-[11px] outline-none border ${
                                          d <= 0
                                            ? 'bg-slate-50 dark:bg-dk-bg/40 border-transparent text-slate-300 dark:text-dk-muted'
                                            : 'bg-slate-50 dark:bg-dk-bg border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text focus:border-indigo-500 dark:focus:border-dk-accent'
                                        }`}
                                      />
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-1.5 text-right font-bold text-slate-700 dark:text-dk-text-soft">{rowTotal || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-50 dark:bg-dk-bg/60 border-t border-slate-200 dark:border-dk-border">
                          <tr>
                            <td className="px-3 py-2 font-bold uppercase text-[9px] text-slate-500 dark:text-dk-muted">Total</td>
                            {sizes.map(sz => {
                              const t = colors.reduce((a, c) => a + (Number(sortieForm.grid[`${c.name}|${sz}`]) || 0), 0);
                              return <td key={sz} className="px-2 py-2 text-center font-bold text-slate-600 dark:text-dk-text-soft">{t || '—'}</td>;
                            })}
                            <td className="px-3 py-2 text-right font-extrabold text-indigo-600 dark:text-dk-accent">{totalSortie || '—'}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <div className="px-4 py-2 border-t border-slate-100 dark:border-dk-border text-[10px] text-slate-500 dark:text-dk-muted">
                      {tx(lang,{fr:'Le gris dans chaque case indique le stock disponible.',ar:'الرقم الرمادي ف كل خانة كيبيّن المخزون المتوفّر.',en:'The grey number in each cell shows available stock.',es:'El numero gris de cada celda indica el stock disponible.',pt:'O numero cinzento em cada celula mostra o stock disponivel.',tr:'Her hucredeki gri sayi mevcut stogu gosterir.'})}
                      {' · '}
                      {tx(lang,{fr:'Montant',ar:'المبلغ',en:'Amount',es:'Importe',pt:'Montante',tr:'Tutar'})} : <b>{fmt(totalSortie * (Number(sortieForm.prix) || 0))} {currency}</b>
                    </div>
                  </div>
                );
              })()}

              {/* GARDE-FOU VENTE A PERTE.
                  Trois cas, jamais melanges : (1) cout inconnu -> on dit
                  franchement qu'AUCUN controle n'a eu lieu ; (2) prix sous le
                  plancher -> alerte selon la politique de l'entreprise ;
                  (3) rien a signaler -> rien n'est affiche. */}
              {sortieCout == null ? (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50">
                  <Info className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0 mt-0.5" />
                  <p className="text-[10px] text-slate-500 dark:text-dk-muted leading-snug">
                    {tx(lang,{fr:"Prix de revient inconnu pour ce modele : aucun controle de marge n'a ete effectue sur ce prix.",ar:'ثمن التكلفة ديال هاد الموديل غير معروف: ما تدارت حتى مراقبة للهامش على هاد الثمن.',en:'Cost price unknown for this model: no margin check was performed on this price.',es:'Precio de coste desconocido para este modelo: no se ha realizado ningun control de margen sobre este precio.',pt:'Preco de custo desconhecido para este modelo: nenhum controlo de margem foi efetuado sobre este preco.',tr:'Bu model icin maliyet fiyati bilinmiyor: bu fiyat uzerinde marj kontrolu yapilmadi.'})}
                  </p>
                </div>
              ) : sortieSousPlancher ? (
                <div className={
                  venteSousCoutPolicy === 'BLOCK'
                    ? 'px-3 py-2.5 rounded-xl border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/30'
                    : venteSousCoutPolicy === 'CONFIRM'
                      ? 'px-3 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30'
                      : 'px-3 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50'
                }>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={
                      venteSousCoutPolicy === 'BLOCK'
                        ? 'w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5'
                        : venteSousCoutPolicy === 'CONFIRM'
                          ? 'w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5'
                          : 'w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0 mt-0.5'
                    } />
                    <div className="min-w-0">
                      <p className={
                        venteSousCoutPolicy === 'BLOCK'
                          ? 'text-[11px] font-bold text-rose-700 dark:text-rose-400'
                          : venteSousCoutPolicy === 'CONFIRM'
                            ? 'text-[11px] font-bold text-amber-700 dark:text-amber-400'
                            : 'text-[11px] font-bold text-slate-600 dark:text-dk-text-soft'
                      }>
                        {venteSousCoutPolicy === 'BLOCK'
                          ? tx(lang,{fr:'Vente sous le prix plancher : enregistrement bloque.',ar:'بيع تحت الثمن الأدنى: التسجيل محجور.',en:'Sale below the floor price: saving is blocked.',es:'Venta por debajo del precio minimo: registro bloqueado.',pt:'Venda abaixo do preco minimo: registo bloqueado.',tr:'Taban fiyatin altinda satis: kayit engellendi.'})
                          : venteSousCoutPolicy === 'CONFIRM'
                            ? tx(lang,{fr:'Vente sous le prix plancher : confirmation et motif requis.',ar:'بيع تحت الثمن الأدنى: خاص التأكيد والسبب.',en:'Sale below the floor price: confirmation and reason required.',es:'Venta por debajo del precio minimo: se requiere confirmacion y motivo.',pt:'Venda abaixo do preco minimo: confirmacao e motivo obrigatorios.',tr:'Taban fiyatin altinda satis: onay ve gerekce gerekli.'})
                            : tx(lang,{fr:'Information : ce prix est sous le prix plancher.',ar:'إخبار: هاد الثمن تحت الثمن الأدنى.',en:'For information: this price is below the floor price.',es:'Informacion: este precio esta por debajo del precio minimo.',pt:'Informacao: este preco esta abaixo do preco minimo.',tr:'Bilgi: bu fiyat taban fiyatin altinda.'})}
                      </p>
                      {/* Le plancher revele le cout : il n'est chiffre que pour
                          qui a le droit de voir le prix de revient. */}
                      {canSeeCostHere && sortiePlancher != null && (
                        <p className="text-[10px] text-slate-600 dark:text-dk-text-soft mt-0.5">
                          {tx(lang,{fr:'Plancher',ar:'الثمن الأدنى',en:'Floor price',es:'Precio minimo',pt:'Preco minimo',tr:'Taban fiyat'})} : {fmt(sortiePlancher)} {currency}
                          {' · '}{tx(lang,{fr:'revient',ar:'التكلفة',en:'cost',es:'coste',pt:'custo',tr:'maliyet'})} {fmt(sortieCout)} {currency}
                          {' · '}{tx(lang,{fr:'marge minimale',ar:'الهامش الأدنى',en:'minimum margin',es:'margen minimo',pt:'margem minima',tr:'asgari marj'})} {margeMinimale} %
                        </p>
                      )}
                    </div>
                  </div>

                  {venteSousCoutPolicy === 'CONFIRM' && sortieConfirmSousCout && (
                    <div className="mt-2.5">
                      <label className="block font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest text-[9px] mb-1">
                        {tx(lang,{fr:'Motif (obligatoire)',ar:'السبب (إجباري)',en:'Reason (required)',es:'Motivo (obligatorio)',pt:'Motivo (obrigatorio)',tr:'Gerekce (zorunlu)'})}
                      </label>
                      <input
                        type="text"
                        autoFocus
                        value={sortieMotif}
                        onChange={e => setSortieMotif(e.target.value)}
                        placeholder={tx(lang,{fr:'Ex. : ecoulement de fin de serie, geste commercial…',ar:'مثلا: تصفية آخر السلسلة، لفتة تجارية…',en:'E.g. end-of-run clearance, commercial gesture…',es:'Ej.: liquidacion de fin de serie, gesto comercial…',pt:'Ex.: escoamento de fim de serie, gesto comercial…',tr:'Or. seri sonu tasfiyesi, ticari jest…'})}
                        className="w-full bg-white dark:bg-dk-bg border border-amber-300 dark:border-amber-800/50 rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-amber-500 dark:focus:border-amber-500"
                      />
                      <p className="text-[9px] text-amber-700 dark:text-amber-400 mt-1">
                        {tx(lang,{fr:'Ce motif est conserve dans la note de la sortie et restera consultable.',ar:'هاد السبب كيتسجّل ف ملاحظة الإخراج وكيبقى قابل للمراجعة.',en:'This reason is stored in the exit note and stays auditable.',es:'Este motivo se guarda en la nota de la salida y sigue siendo consultable.',pt:'Este motivo fica guardado na nota da saida e permanece consultavel.',tr:'Bu gerekce cikis notunda saklanir ve incelenebilir kalir.'})}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

              {sortieError && (
                <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">{sortieError}</p>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-dk-border flex justify-end gap-2 sticky bottom-0 bg-white dark:bg-dk-surface">
              <button
                type="button"
                onClick={() => setSortieForm(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors"
              >
                {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'Iptal'})}
              </button>
              <button
                type="button"
                disabled={sortieSaving || (sortieSousPlancher && venteSousCoutPolicy === 'BLOCK')}
                onClick={submitSortie}
                className={
                  sortieSousPlancher && venteSousCoutPolicy === 'CONFIRM'
                    ? 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 dark:bg-amber-600 text-white font-bold text-[11px] hover:bg-amber-700 transition-colors disabled:opacity-40'
                    : 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 dark:bg-dk-accent text-white font-bold text-[11px] hover:bg-indigo-700 transition-colors disabled:opacity-40'
                }
              >
                {sortieSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {sortieSousPlancher && venteSousCoutPolicy === 'CONFIRM' && !sortieConfirmSousCout
                  ? tx(lang,{fr:'Vendre sous le plancher…',ar:'البيع تحت الثمن الأدنى…',en:'Sell below the floor…',es:'Vender por debajo del minimo…',pt:'Vender abaixo do minimo…',tr:'Taban altinda sat…'})
                  : tx(lang,{fr:'Enregistrer la sortie',ar:'حفظ الإخراج',en:'Save the exit',es:'Guardar la salida',pt:'Guardar a saida',tr:'Cikisi kaydet'})}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Clôture de commande + évaluation du sous-traitant. */}
      {finishForm && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setFinishForm(null)}>
          <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-2.5">
              <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-slate-800 dark:text-dk-text">
                  {tx(lang,{fr:'Terminer cette commande ?',ar:'إنهاء هاد الأمر؟',en:'Close this order?',es:'¿Cerrar este pedido?',pt:'Fechar esta encomenda?',tr:'Bu sipariş kapatılsın mı?'})}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-1">
                  {finishForm.order.modelName || finishForm.order.modelId} — {finishForm.order.subcontractorName}
                  {' · '}
                  {(finishForm.order.qtyAccepted || 0).toLocaleString(dateLocale)} / {finishForm.order.totalQuantity.toLocaleString(dateLocale)} pcs
                </p>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1.5">
                {tx(lang,{fr:'Évaluation du sous-traitant',ar:'تقييم السوطراطور',en:'Subcontractor rating',es:'Evaluación del subcontratista',pt:'Avaliação do subcontratado',tr:'Taşeron değerlendirmesi'})}
              </label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFinishForm(prev => prev && ({ ...prev, rating: n }))}
                    className="p-0.5"
                    title={`${n}/5`}
                  >
                    <Star className={`w-5 h-5 ${n <= finishForm.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-dk-muted'}`} />
                  </button>
                ))}
                <span className="ml-2 text-[11px] font-bold text-slate-500 dark:text-dk-muted">{finishForm.rating}/5</span>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-dk-muted mt-1.5">
                {tx(lang,{
                  fr:"Notée maintenant, tant que la livraison est fraîche : l'évaluation reste attachée à cette commande.",
                  ar:'تُسجَّل الآن والتسليم قريب: التقييم يبقى مرتبطاً بهاد الأمر.',
                  en:'Rated now, while the delivery is fresh: the rating stays attached to this order.',
                  es:'Evaluado ahora, con la entrega reciente: la nota queda ligada a este pedido.',
                  pt:'Avaliado agora, com a entrega recente: a nota fica ligada a esta encomenda.',
                  tr:'Teslimat tazeyken şimdi puanlanır: puan bu siparişe bağlı kalır.',
                })}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFinishForm(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors"
              >
                {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
              </button>
              <button
                type="button"
                disabled={finishSaving}
                onClick={confirmFinishOrder}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 transition-colors disabled:opacity-40"
              >
                {finishSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
                {tx(lang,{fr:'Terminer',ar:'إنهاء',en:'Close',es:'Cerrar',pt:'Fechar',tr:'Kapat'})}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation de suppression d'une entrée en stock. */}
      {batchPendingDelete && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setBatchPendingDelete(null)}>
          <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-2.5">
              <Trash2 className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-slate-800 dark:text-dk-text">
                  {tx(lang,{
                    fr:`Supprimer cette entrée de ${batchPendingDelete.total} pcs ?`,
                    ar:`حذف هاد الإدخال ديال ${batchPendingDelete.total} قطعة؟`,
                    en:`Delete this entry of ${batchPendingDelete.total} pcs?`,
                    es:`¿Eliminar esta entrada de ${batchPendingDelete.total} pzs?`,
                    pt:`Eliminar esta entrada de ${batchPendingDelete.total} pçs?`,
                    tr:`${batchPendingDelete.total} adetlik bu giriş silinsin mi?`,
                  })}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-1">
                  {batchPendingDelete.date ? fmtDate(batchPendingDelete.date) : '—'}
                  {' · '}
                  {tx(lang,{fr:'le stock de la commande sera recalculé.',ar:'مخزون الأمر غادي يتعاود حسابو.',en:'the order stock will be recalculated.',es:'el stock del pedido se recalculará.',pt:'o stock da encomenda será recalculado.',tr:'siparişin stoğu yeniden hesaplanacak.'})}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBatchPendingDelete(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors"
              >
                {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
              </button>
              <button
                type="button"
                disabled={stockEntrySaving}
                onClick={() => { const id = batchPendingDelete.id; setBatchPendingDelete(null); removeStockBatch(id); }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-[11px] hover:bg-rose-700 transition-colors disabled:opacity-40"
              >
                {tx(lang,{fr:'Supprimer',ar:'حذف',en:'Delete',es:'Eliminar',pt:'Eliminar',tr:'Sil'})}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation d'un jalon libre (bascule ou suppression). */}
      {customConfirm && createPortal(
        <div className="fixed inset-0 z-[240] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setCustomConfirm(null)}>
          <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-2.5">
              {customConfirm.action === 'remove'
                ? <Trash2 className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                : <ClipboardCheck className="w-4 h-4 text-indigo-600 dark:text-dk-accent shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-slate-800 dark:text-dk-text">
                  {customConfirm.action === 'remove'
                    ? tx(lang,{fr:`Supprimer le jalon « ${customConfirm.label} » ?`,ar:`حذف المرحلة «${customConfirm.label}»؟`,en:`Delete the milestone “${customConfirm.label}”?`,es:`¿Eliminar el hito «${customConfirm.label}»?`,pt:`Eliminar o marco “${customConfirm.label}”?`,tr:`“${customConfirm.label}” kilometre taşı silinsin mi?`})
                    : customConfirm.done
                      ? tx(lang,{fr:`Décocher « ${customConfirm.label} » ?`,ar:`إلغاء تعليم «${customConfirm.label}»؟`,en:`Uncheck “${customConfirm.label}”?`,es:`¿Desmarcar «${customConfirm.label}»?`,pt:`Desmarcar “${customConfirm.label}”?`,tr:`“${customConfirm.label}” işareti kaldırılsın mı?`})
                      : tx(lang,{fr:`Confirmer « ${customConfirm.label} » comme fait ?`,ar:`تأكيد «${customConfirm.label}» كمُنجَز؟`,en:`Confirm “${customConfirm.label}” as done?`,es:`¿Confirmar «${customConfirm.label}» como hecho?`,pt:`Confirmar “${customConfirm.label}” como feito?`,tr:`“${customConfirm.label}” tamamlandı olarak onaylansın mı?`})}
                </p>
                {customConfirm.action === 'remove' && (
                  <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1">
                    {tx(lang,{fr:'Action définitive.',ar:'إجراء نهائي.',en:'This cannot be undone.',es:'Acción definitiva.',pt:'Ação definitiva.',tr:'Bu geri alınamaz.'})}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomConfirm(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors"
              >
                {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
              </button>
              <button
                type="button"
                onClick={() => {
                  const c = customConfirm;
                  setCustomConfirm(null);
                  if (c.action === 'remove') handleRemoveCustomMilestone(c.order, c.id);
                  else handleToggleCustomMilestone(c.order, c.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-white font-bold text-[11px] transition-colors ${
                  customConfirm.action === 'remove' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700'
                }`}
              >
                {customConfirm.action === 'remove'
                  ? tx(lang,{fr:'Supprimer',ar:'حذف',en:'Delete',es:'Eliminar',pt:'Eliminar',tr:'Sil'})
                  : tx(lang,{fr:'Confirmer',ar:'تأكيد',en:'Confirm',es:'Confirmar',pt:'Confirmar',tr:'Onayla'})}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Fiches d'entité — modèle et client, avec pile de navigation croisée. */}
      {entityStack.length > 0 && (
        <EntitySheet
          stack={entityStack}
          onPush={pushEntitySheet}
          onBack={backEntitySheet}
          onClose={closeEntitySheet}
          models={models}
          orders={orders}
          clients={atelierClients}
          sorties={allStockSorties}
          stats={modelStockStats}
          stockMatrix={stockMatrixByModel}
          currency={currency}
          dateLocale={dateLocale}
          onEditClient={editClientFromSheet}
          prixParClientEnabled={prixParClientEnabled}
          canSeeCost={canSeeCostHere}
          canSetPrice={canSetPriceHere}
          clientTypeLabels={clientTypeLabels}
        />
      )}

      {isDetailModalOpen && detailOrder && (
        <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="relative my-auto bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-none sm:rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-none sm:max-w-2xl overflow-hidden flex flex-col h-[100dvh] sm:h-auto max-h-none sm:max-h-[85vh] text-slate-700 dark:text-dk-text">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-surface/55">
              <h2 className="font-bold text-slate-800 dark:text-dk-text text-base">{tx(lang,{fr:'Fiche de Commande Sous-traitance',ar:'بطاقة أمر المقاولة من الباطن',en:'Subcontract Order Sheet',es:'Ficha de Pedido de Subcontratación',pt:'Ficha de Encomenda de Subcontratação',tr:'Taşeron Sipariş Kartı'})}</h2>
              <button onClick={() => setIsDetailModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              <div className="grid grid-cols-2 gap-4">
                {(() => {
                  const profile = subcontractorProfiles.find(p => p.name === detailOrder.subcontractorName);
                  return (
                    <div
                      onClick={profile ? () => { setIsDetailModalOpen(false); setActiveTab('subcontractors'); setSelectedSubcontractorName(detailOrder.subcontractorName); } : undefined}
                      className={`bg-slate-50 dark:bg-dk-surface/75 p-4 rounded-xl border border-slate-200 dark:border-dk-border flex items-center gap-3 ${profile ? 'cursor-pointer hover:border-indigo-300 dark:hover:border-dk-accent hover:bg-indigo-50/40 dark:hover:bg-dk-elevated transition-colors' : ''}`}
                    >
                      {profile?.photo ? (
                        <img src={profile.photo} alt={detailOrder.subcontractorName} className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-dk-border shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                          <Users className="w-5 h-5 text-slate-400 dark:text-dk-muted" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-widest block">{tx(lang,{fr:'Sous-traitant',ar:'المقاول من الباطن',en:'Subcontractor',es:'Subcontratista',pt:'Subcontratado',tr:'Taşeron'})}</span>
                          {profile && (
                            <span className="text-[9px] font-bold text-indigo-600 dark:text-dk-accent-text flex items-center gap-0.5 shrink-0">
                              {tx(lang,{fr:'Voir sa fiche',ar:'عرض ملفه',en:'View profile',es:'Ver ficha',pt:'Ver ficha',tr:'Profili gör'})}
                              <ArrowRight className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-bold text-slate-800 dark:text-dk-text mt-1 block truncate">{detailOrder.subcontractorName}</span>
                        {detailOrder.subcontractorPhone && <span className="text-slate-500 dark:text-dk-muted block mt-1">{tx(lang,{fr:'Tél:',ar:'الهاتف:',en:'Tel:',es:'Tel:',pt:'Tel:',tr:'Tel:'})} {detailOrder.subcontractorPhone}</span>}
                      </div>
                    </div>
                  );
                })()}
                <div className="bg-slate-50 dark:bg-dk-surface/75 p-4 rounded-xl border border-slate-200 dark:border-dk-border">
                  <span className="text-[9px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-widest block">{tx(lang,{fr:'Client Donneur d\'Ordre',ar:'العميل صاحب الطلب',en:'Ordering Client',es:'Cliente Ordenante',pt:'Cliente Mandante',tr:'Sipariş Veren Müşteri'})}</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-dk-text mt-1 block">{detailOrder.clientName || 'N/A'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 dark:bg-dk-surface/75 p-4 rounded-xl border border-slate-200 dark:border-dk-border">
                <div className="col-span-2 sm:col-span-1 flex items-center gap-3">
                  {(() => {
                    const matchedModel = models.find(m => m.id === detailOrder.modelId);
                    return matchedModel?.image ? (
                      <img src={matchedModel.image} alt={detailOrder.modelName} className="w-11 h-11 rounded-lg object-cover border border-slate-200 dark:border-dk-border shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-slate-200 dark:bg-dk-elevated flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                      </div>
                    );
                  })()}
                  <div className="min-w-0">
                    <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Modèle',ar:'الموديل',en:'Model',es:'Modelo',pt:'Modelo',tr:'Model'})}</span>
                    <span
                      onClick={() => {
                        const matched = models.find(m => m.id === detailOrder.modelId);
                        if (onLoadModel && matched) {
                          onLoadModel(matched);
                          setIsDetailModalOpen(false);
                        }
                      }}
                      className={`font-bold text-slate-800 dark:text-dk-text block mt-0.5 truncate ${models.find(m => m.id === detailOrder.modelId) ? 'hover:text-indigo-600 dark:hover:text-dk-accent hover:underline cursor-pointer' : ''}`}
                      title={models.find(m => m.id === detailOrder.modelId) ? tx(lang,{fr:"Ouvrir dans l'ingénierie",ar:'فتح في الهندسة الفنية',en:'Open in engineering',es:'Abrir en ingeniería',pt:'Abrir na engenharia',tr:'Mühendislikte aç'}) : undefined}
                    >
                      {detailOrder.modelName}
                    </span>
                  </div>
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

              {/* Fournisseurs des matières vs mode de calcul du coût.
                  Le prix de revient ne connaît que `soustraitance.mode` : Façon =
                  matières + prix, Tout compris = prix seul. Si les fournisseurs
                  saisis sur la commande disent autre chose, le modèle facture des
                  matières qu'il ne paie pas (ou l'inverse, bien plus grave). On
                  affiche l'écart et on laisse l'utilisateur trancher. */}
              {(() => {
                const matchedModel = models.find(m => m.id === detailOrder.modelId);
                if (!matchedModel) return null;
                const st: any = (matchedModel.ficheData as any)?.soustraitance;
                if (!st?.active) return null;

                const inferred = inferSubcontractMode(detailOrder);
                const current: StMode = st.mode === 'complet' ? 'complet' : 'facon';
                // Cas partiel : le sous-traitant fournit une partie des matières
                // seulement. Aucun mode ne le représente exactement — on le signale
                // sans rien recalculer, faute de catégorie tissu/fourniture fiable.
                const subCount = [
                  detailOrder.tissuFournisseur,
                  detailOrder.fournituresFournisseur,
                  detailOrder.conditionnementFournisseur,
                ].filter(v => v === 'SUBCONTRACTOR').length;
                const partial = subCount > 0 && subCount < 3 && current === 'facon';
                if (inferred === current && !partial) return null;

                const labelOf = (m: StMode) => m === 'complet'
                  ? tx(lang,{fr:'Tout compris',ar:'شامل',en:'All-inclusive',es:'Todo incluido',pt:'Tudo incluído',tr:'Her şey dahil'})
                  : tx(lang,{fr:'Façon',ar:'فاصون',en:'CMT',es:'Confección',pt:'Confecção',tr:'Fason'});

                return (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold text-amber-900 dark:text-amber-300 block">
                          {tx(lang,{fr:'Fournisseurs des matières et mode de coût divergent',ar:'موفّرو المواد ووضع الحساب غير متطابقين',en:'Material suppliers and cost mode diverge',es:'Proveedores de materias y modo de coste divergen',pt:'Fornecedores de materiais e modo de custo divergem',tr:'Malzeme tedarikçileri ve maliyet modu uyuşmuyor'})}
                        </span>
                        <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-400/90 block mt-0.5">
                          {tx(lang,{fr:'Tissu',ar:'التيسو',en:'Fabric',es:'Tejido',pt:'Tecido',tr:'Kumaş'})}: {detailOrder.tissuFournisseur === 'SUBCONTRACTOR' ? tx(lang,{fr:'sous-traitant',ar:'السوطراطور',en:'subcontractor',es:'subcontratista',pt:'subcontratado',tr:'fasoncu'}) : tx(lang,{fr:'nous',ar:'نحن',en:'us',es:'nosotros',pt:'nós',tr:'biz'})}
                          {' · '}
                          {tx(lang,{fr:'Fournitures',ar:'اللوازم',en:'Trims',es:'Avíos',pt:'Aviamentos',tr:'Aksesuar'})}: {detailOrder.fournituresFournisseur === 'SUBCONTRACTOR' ? tx(lang,{fr:'sous-traitant',ar:'السوطراطور',en:'subcontractor',es:'subcontratista',pt:'subcontratado',tr:'fasoncu'}) : tx(lang,{fr:'nous',ar:'نحن',en:'us',es:'nosotros',pt:'nós',tr:'biz'})}
                        </span>
                        {inferred !== current && (
                          <span className="text-[10px] font-semibold text-amber-900 dark:text-amber-300 block mt-0.5">
                            {tx(lang,{fr:'Mode appliqué au coût',ar:'الوضع المطبَّق على التكلفة',en:'Mode applied to cost',es:'Modo aplicado al coste',pt:'Modo aplicado ao custo',tr:'Maliyete uygulanan mod'})}: <b>{labelOf(current)}</b>
                            {' → '}
                            {tx(lang,{fr:'attendu',ar:'المتوقَّع',en:'expected',es:'esperado',pt:'esperado',tr:'beklenen'})}: <b>{labelOf(inferred)}</b>
                          </span>
                        )}
                        {inferred === 'facon' && current === 'complet' && (
                          <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-400 block mt-0.5">
                            {tx(lang,{fr:'Les matières que vous payez ne sont PAS dans le prix de revient.',ar:'المواد اللي كتخلّص ما داخلاش في ثمن التكلفة.',en:'The materials you pay for are NOT in the cost price.',es:'Las materias que pagas NO están en el coste.',pt:'As matérias que paga NÃO estão no custo.',tr:'Ödediğiniz malzemeler maliyete dahil DEĞİL.'})}
                          </span>
                        )}
                        {partial && (
                          <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-400/90 block mt-0.5">
                            {tx(lang,{fr:'Partage partiel : le coût compte TOUTES les matières, y compris celles fournies par le sous-traitant. Corrigez les prix concernés dans la fiche de coût.',ar:'تقسيم جزئي: التكلفة كتحسب كل المواد، حتى اللي كيوفّرها السوطراطور. صحّح الأثمنة المعنية في بطاقة التكلفة.',en:'Partial split: the cost counts ALL materials, including those supplied by the subcontractor. Fix the affected prices in the cost sheet.',es:'Reparto parcial: el coste cuenta TODAS las materias, incluidas las del subcontratista. Corrige esos precios en la ficha de coste.',pt:'Partilha parcial: o custo conta TODAS as matérias, incluindo as do subcontratado. Corrija esses preços na ficha de custo.',tr:'Kısmi paylaşım: maliyet TÜM malzemeleri sayar, fasoncunun verdikleri dahil. İlgili fiyatları maliyet kartında düzeltin.'})}
                          </span>
                        )}
                      </div>
                    </div>

                    {inferred !== current && (
                      <button
                        type="button"
                        disabled={gridAligning}
                        onClick={async () => {
                          setGridAligning(true);
                          setGridAlignError(null);
                          await writeModelSoustraitance(detailOrder.modelId, { mode: inferred });
                          setGridAligning(false);
                        }}
                        className="bg-white dark:bg-dk-surface border border-amber-300 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-300 px-3 py-1.5 rounded-lg font-bold text-[10px] transition-colors flex items-center gap-1.5 disabled:opacity-40"
                      >
                        {gridAligning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Coins className="w-3 h-3" />}
                        {tx(lang,{fr:'Passer le coût en',ar:'حوّل الحساب إلى',en:'Switch cost mode to',es:'Cambiar el coste a',pt:'Mudar o custo para',tr:'Maliyet modunu şuna al'})} {labelOf(inferred)}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Grille couleur × taille : commande vs fiche de coût du modèle.
                  Une grille modèle différente de ce qui est réellement commandé
                  fausse le prix de revient (base de répartition des frais et des
                  matières). On CHIFFRE l'écart et on propose l'alignement, mais on
                  n'écrit jamais tout seul dans la fiche. */}
              {(() => {
                const matchedModel = models.find(m => m.id === detailOrder.modelId);
                const orderGrid = parseJsonSafe(detailOrder.grid_json, null as any);
                if (!matchedModel || !orderGrid || Object.keys(orderGrid).length === 0) return null;

                const fiche: any = matchedModel.ficheData || {};
                const diff = diffOrderVsModelGrid(
                  orderGrid,
                  fiche.gridQuantities || {},
                  fiche.colors || [],
                  fiche.sizes || [],
                );
                if (!diff.differs) return null;

                return (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold text-amber-900 dark:text-amber-300 block">
                          {tx(lang,{fr:'Grille différente de la fiche de coût',ar:'الشبكة مختلفة عن بطاقة التكلفة',en:'Grid differs from the cost sheet',es:'Rejilla distinta de la ficha de coste',pt:'Grelha diferente da ficha de custo',tr:'Izgara maliyet kartından farklı'})}
                        </span>
                        <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-400/90 block mt-0.5">
                          {tx(lang,{fr:'Commande',ar:'الأمر',en:'Order',es:'Pedido',pt:'Encomenda',tr:'Sipariş'})}: {diff.orderTotal.toLocaleString()} pcs
                          {' · '}
                          {tx(lang,{fr:'Modèle',ar:'الموديل',en:'Model',es:'Modelo',pt:'Modelo',tr:'Model'})}: {diff.modelTotal.toLocaleString()} pcs
                          {diff.delta !== 0 && (
                            <span className={diff.delta < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-amber-900 dark:text-amber-300'}>
                              {' '}({diff.delta > 0 ? '+' : ''}{diff.delta.toLocaleString()})
                            </span>
                          )}
                        </span>
                        {diff.delta < 0 && (
                          <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-400 block mt-0.5">
                            {tx(lang,{fr:'Le prix de revient est calculé sur moins de pièces que commandé.',ar:'ثمن التكلفة محسوب على قطع أقلّ من المطلوبة.',en:'Cost price is computed on fewer pieces than ordered.',es:'El coste se calcula sobre menos piezas que las pedidas.',pt:'O custo é calculado sobre menos peças que as encomendadas.',tr:'Maliyet, sipariş edilenden az parça üzerinden hesaplanıyor.'})}
                          </span>
                        )}
                        {(diff.unmatchedColors.length > 0 || diff.unmatchedSizes.length > 0) && (
                          <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-400/90 block mt-0.5">
                            {tx(lang,{fr:'Absent du modèle',ar:'غير موجود في الموديل',en:'Missing from the model',es:'Ausente del modelo',pt:'Ausente do modelo',tr:'Modelde yok'})}
                            {': '}
                            {[...diff.unmatchedColors, ...diff.unmatchedSizes].join(', ')}
                            {' — '}
                            {tx(lang,{fr:'ces quantités ne seront pas reportées.',ar:'هاد الكميات ما غاديش تُنقل.',en:'these quantities will not be transferred.',es:'estas cantidades no se transferirán.',pt:'estas quantidades não serão transferidas.',tr:'bu miktarlar aktarılmayacak.'})}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={gridAligning}
                        onClick={async () => {
                          setGridAligning(true);
                          setGridAlignError(null);
                          const ok = await writeModelGrid(detailOrder.modelId, diff.proposed);
                          if (!ok) setGridAlignError(tx(lang,{fr:"L'alignement a échoué.",ar:'فشلت المطابقة.',en:'Alignment failed.',es:'La alineación falló.',pt:'O alinhamento falhou.',tr:'Hizalama başarısız oldu.'}));
                          setGridAligning(false);
                        }}
                        className="bg-white dark:bg-dk-surface border border-amber-300 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-300 px-3 py-1.5 rounded-lg font-bold text-[10px] transition-colors flex items-center gap-1.5 disabled:opacity-40"
                      >
                        {gridAligning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
                        {tx(lang,{fr:'Aligner la fiche de coût sur la commande',ar:'مطابقة بطاقة التكلفة مع الأمر',en:'Align the cost sheet with the order',es:'Alinear la ficha de coste con el pedido',pt:'Alinhar a ficha de custo com a encomenda',tr:'Maliyet kartını siparişle hizala'})}
                      </button>
                    </div>

                    {gridAlignError && (
                      <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">{gridAlignError}</p>
                    )}
                  </div>
                );
              })()}

              {/* Jalons — mêmes contrôles que sur la carte, en plus grand */}
              <div className="bg-slate-50 dark:bg-dk-bg/75 border border-slate-200 dark:border-dk-border rounded-xl p-4 space-y-2.5">
                <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px] tracking-wide">
                  {tx(lang,{fr:'Jalons — cliquer pour basculer',ar:'المراحل — انقر للتبديل',en:'Milestones — click to toggle',es:'Hitos — clic para alternar',pt:'Marcos — clique para alternar',tr:'Kilometre taşları — değiştirmek için tıklayın'})}
                </span>
                <div className="flex flex-wrap gap-2">
                  {milestoneChips(detailOrder, 'md').map(chip => (
                    <MilestoneChip key={chip.field} {...chip} onToggle={() => requestToggleMilestone(detailOrder, chip.field)} />
                  ))}
                  {customMilestones.map(m => (
                    editingMilestoneId === m.id ? (
                      <span key={m.id} className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="text"
                          value={editingMilestoneLabel}
                          onChange={(e) => setEditingMilestoneLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleRenameCustomMilestone(detailOrder, m.id); }
                            if (e.key === 'Escape') { e.preventDefault(); setEditingMilestoneId(null); }
                          }}
                          onBlur={() => handleRenameCustomMilestone(detailOrder, m.id)}
                          className="bg-white dark:bg-dk-surface border border-indigo-300 dark:border-dk-accent rounded px-2 py-1.5 text-[10px] font-bold text-slate-800 dark:text-dk-text outline-none w-28"
                        />
                      </span>
                    ) : (
                      <span
                        key={m.id}
                        className={`font-bold rounded border flex items-center gap-1 text-[10px] px-2.5 py-1.5 ${
                          m.done ? customMilestoneColor(m.id) : 'bg-slate-50 dark:bg-dk-bg text-slate-400 dark:text-dk-muted border-slate-200 dark:border-dk-border'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setCustomConfirm({ order: detailOrder, id: m.id, label: m.label, action: 'toggle', done: m.done })}
                          title={tx(lang,{fr:'Cliquer pour basculer',ar:'انقر للتبديل',en:'Click to toggle',es:'Clic para alternar',pt:'Clique para alternar',tr:'Değiştirmek için tıklayın'})}
                          className="flex items-center gap-1 hover:brightness-95 dark:hover:brightness-125 transition-colors"
                        >
                          {m.done ? <Check className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5 opacity-0" />}
                          {m.label}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingMilestoneId(m.id); setEditingMilestoneLabel(m.label); }}
                          title={tx(lang,{fr:'Renommer ce jalon',ar:'إعادة تسمية هاد المرحلة',en:'Rename this milestone',es:'Renombrar este hito',pt:'Renomear este marco',tr:'Bu kilometre taşını yeniden adlandır'})}
                          className="text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent"
                        >
                          <Edit2 className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomConfirm({ order: detailOrder, id: m.id, label: m.label, action: 'remove', done: m.done })}
                          title={tx(lang,{fr:'Supprimer ce jalon',ar:'حذف هاد المرحلة',en:'Remove this milestone',es:'Eliminar este hito',pt:'Remover este marco',tr:'Bu kilometre taşını kaldır'})}
                          className="text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    )
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newMilestoneLabel}
                    onChange={(e) => setNewMilestoneLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomMilestone(detailOrder); } }}
                    placeholder={tx(lang,{fr:'Ajouter un jalon (repassage, contrôle qualité…)',ar:'إضافة مرحلة (كوي، مراقبة الجودة…)',en:'Add a milestone (ironing, quality check…)',es:'Añadir un hito (planchado, control de calidad…)',pt:'Adicionar um marco (engomar, controlo de qualidade…)',tr:'Kilometre taşı ekle (ütüleme, kalite kontrol…)'})}
                    className="flex-1 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-1.5 text-[11px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                  />
                  <button
                    type="button"
                    disabled={milestoneSaving || !newMilestoneLabel.trim()}
                    onClick={() => handleAddCustomMilestone(detailOrder)}
                    className="shrink-0 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:bg-slate-100 dark:hover:bg-dk-elevated text-slate-600 dark:text-dk-text-soft px-2.5 py-1.5 rounded-lg font-bold text-[10px] transition-colors flex items-center gap-1 disabled:opacity-40"
                  >
                    <Plus className="w-3 h-3" />
                    {tx(lang,{fr:'Ajouter',ar:'إضافة',en:'Add',es:'Añadir',pt:'Adicionar',tr:'Ekle'})}
                  </button>
                </div>

                {milestoneError && (
                  <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">{milestoneError}</p>
                )}
              </div>

              {/* A : coupe interne — statut réel lu depuis models[].ordreCoupe.status
                  (rempli par le module La Coupe). VALIDE = coupé et confirmé,
                  sinon on affiche encore un rappel car le passage n'est pas garanti. */}
              {readCoupeLocation(detailOrder) === 'INTERNAL' && (() => {
                const matchedModel = models.find(m => m.id === detailOrder.modelId);
                const coupeStatus = matchedModel?.ordreCoupe?.status;
                const isValidated = coupeStatus === 'VALIDE';
                const isInProgress = coupeStatus === 'EN_COURS';
                return (
                  <div className={`flex items-start gap-2 px-3.5 py-2.5 rounded-xl border ${
                    isValidated
                      ? 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300'
                      : 'bg-amber-50 dark:bg-amber-900/25 border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300'
                  }`}>
                    {isValidated ? <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                    <span className="text-[11px] font-semibold leading-relaxed">
                      {isValidated
                        ? tx(lang,{fr:'Coupe confirmée dans le module Coupe — prêt pour expédition.',ar:'القص تأكّد فمودول القص — واجد للإرسال.',en:'Cutting confirmed in the Cutting module — ready to ship.',es:'Corte confirmado en el módulo de Corte — listo para envío.',pt:'Corte confirmado no módulo de Corte — pronto para expedição.',tr:'Kesim modülünde onaylandı — sevkiyata hazır.'})
                        : isInProgress
                        ? tx(lang,{fr:'Coupe en cours dans le module Coupe — pas encore confirmée.',ar:'القص فالطريق فمودول القص — مازال ما تأكّدش.',en:'Cutting in progress in the Cutting module — not confirmed yet.',es:'Corte en curso en el módulo de Corte — aún no confirmado.',pt:'Corte em curso no módulo de Corte — ainda não confirmado.',tr:'Kesim modülünde devam ediyor — henüz onaylanmadı.'})
                        : tx(lang,{fr:'Ce modèle est coupé en interne — pas encore lancé dans le module Coupe.',ar:'هاد الموديل كيتقطّع عندنا — مازال ما تلقاش فمودول القص.',en:'This model is cut in-house — not yet started in the Cutting module.',es:'Este modelo se corta internamente — aún no iniciado en el módulo de Corte.',pt:'Este modelo é cortado internamente — ainda não iniciado no módulo de Corte.',tr:'Bu model şirket içinde kesiliyor — Kesim modülünde henüz başlatılmadı.'})}
                    </span>
                  </div>
                );
              })()}

              {/* Matières & Fournisseurs à prévoir — mode Façon uniquement (le client fournit la matière) */}
              {detailOrder.tissuFournisseur !== 'SUBCONTRACTOR' && (() => {
                const rows = getFaconMaterialsNeeds(detailOrder, parseJsonSafe(detailOrder.materials_fournisseur_json, {} as Record<string, string>));
                if (!rows.length) return null;
                return (
                  <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border">
                      <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">{tx(lang,{fr:'Matières & fournisseurs à prévoir',ar:'المواد والموردون المطلوبون',en:'Materials & suppliers to plan',es:'Materiales y proveedores a prever',pt:'Materiais e fornecedores a prever',tr:'Öngörülecek malzeme ve tedarikçiler'})}</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="bg-white dark:bg-dk-surface text-slate-400 dark:text-dk-muted uppercase tracking-wide text-[9px] border-b border-slate-100 dark:border-dk-border">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium">{tx(lang,{fr:'Matière',ar:'المادة',en:'Material',es:'Material',pt:'Material',tr:'Malzeme'})}</th>
                            <th className="px-4 py-2 text-center font-medium">{tx(lang,{fr:'Besoin',ar:'الاحتياج',en:'Need',es:'Necesidad',pt:'Necessidade',tr:'İhtiyaç'})}</th>
                            <th className="px-4 py-2 text-center font-medium">{tx(lang,{fr:'En stock',ar:'في المخزون',en:'In stock',es:'En stock',pt:'Em stock',tr:'Stokta'})}</th>
                            <th className="px-4 py-2 text-center font-medium">{tx(lang,{fr:'Manque',ar:'النقص',en:'Shortage',es:'Déficit',pt:'Falta',tr:'Eksiklik'})}</th>
                            <th className="px-4 py-2 text-center font-medium">{tx(lang,{fr:'Fournisseur',ar:'المورد',en:'Supplier',es:'Proveedor',pt:'Fornecedor',tr:'Tedarikçi'})}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                          {rows.map(r => (
                            <tr key={r.id}>
                              <td className="px-4 py-2 font-semibold text-slate-700 dark:text-dk-text-soft">
                                <span className="inline-flex items-center gap-1.5">
                                  {materialPhotoOf(r.name)
                                    ? <img src={materialPhotoOf(r.name)} alt="" className="w-5 h-5 rounded object-cover border border-slate-200 dark:border-dk-border shrink-0" />
                                    : <Package className="w-3.5 h-3.5 text-slate-300 dark:text-dk-muted shrink-0" />}
                                  {r.name}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center">{fmt(r.buyQty)} {r.unit}</td>
                              <td className="px-4 py-2 text-center text-slate-500 dark:text-dk-muted">{fmt(r.stockActuel)} {r.unit}</td>
                              <td className={`px-4 py-2 text-center font-bold ${r.manque > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-300 dark:text-dk-muted'}`}>{fmt(r.manque)} {r.unit}</td>
                              <td className="px-4 py-2 text-center">{r.fournisseur || <span className="text-slate-300 dark:text-dk-muted">—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Le prix (matière + provenance stock/manuel) n'est volontairement pas
                        affiché ici — cette table sert à préparer l'approvisionnement, pas à
                        chiffrer. Le coût réel apparaît dans la facture (bouton "Facturer"). */}
                  </div>
                );
              })()}

              {/* ================================================================
                  B — FRAIS ADDITIONNELS LIBRES
                  Libellé 100% libre, montant, portée facultative. Toujours
                  optionnels : leur absence n'est pas une anomalie.
                  ================================================================ */}
              <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">
                    {tx(lang,{fr:'Frais additionnels',ar:'مصاريف إضافية',en:'Additional expenses',es:'Gastos adicionales',pt:'Despesas adicionais',tr:'Ek masraflar'})}
                  </h4>
                  <span className="text-[9px] text-slate-400 dark:text-dk-muted font-semibold">
                    {tx(lang,{fr:'Facultatifs — ils entrent dans le coût final du modèle',ar:'اختيارية — كتدخل فالتكلفة النهائية ديال الموديل',en:'Optional — they count in the final model cost',es:'Opcionales — entran en el coste final del modelo',pt:'Facultativas — entram no custo final do modelo',tr:'İsteğe bağlı — modelin nihai maliyetine girer'})}
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  {expensesError && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="text-[10px] font-semibold leading-relaxed">{expensesError}</span>
                    </div>
                  )}

                  {expensesLoading ? (
                    <div className="flex items-center gap-2 text-slate-400 dark:text-dk-muted text-[11px] font-semibold py-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{tx(lang,{fr:'Chargement des frais…',ar:'جاري تحميل المصاريف…',en:'Loading expenses…',es:'Cargando gastos…',pt:'A carregar despesas…',tr:'Masraflar yükleniyor…'})}</span>
                    </div>
                  ) : orderExpenses.length === 0 ? (
                    !expensesError && (
                      <p className="text-[11px] text-slate-400 dark:text-dk-muted italic">
                        {tx(lang,{fr:'Aucun frais additionnel enregistré pour cette commande.',ar:'ما كاين حتى مصروف إضافي مسجّل لهاد الطلبية.',en:'No additional expense recorded for this order.',es:'Ningún gasto adicional registrado para este pedido.',pt:'Nenhuma despesa adicional registada para esta encomenda.',tr:'Bu sipariş için kayıtlı ek masraf yok.'})}
                      </p>
                    )
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-dk-border">
                      {orderExpenses.map(exp => (
                        <li key={exp.id} className="flex items-center gap-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-700 dark:text-dk-text-soft truncate">{exp.label}</p>
                            <p className="text-[10px] text-slate-400 dark:text-dk-muted">
                              {exp.quantity_scope == null
                                ? tx(lang,{fr:'Toute la commande',ar:'الطلبية كاملة',en:'Whole order',es:'Todo el pedido',pt:'Toda a encomenda',tr:'Tüm sipariş'})
                                : `${exp.quantity_scope.toLocaleString()} pcs ${tx(lang,{fr:'sur',ar:'من',en:'of',es:'de',pt:'de',tr:'/'})} ${detailOrder.totalQuantity.toLocaleString()}`}
                            </p>
                          </div>
                          <span className="font-bold text-slate-700 dark:text-dk-text-soft shrink-0">{fmt(exp.amount)} {currency}</span>
                          {/* Justificatif du frais, même mécanique que les factures
                              matière du Pedido. La CLÉ est l'identifiant du frais et
                              non son libellé : renommer « Transport » ne doit pas
                              détacher la facture déjà jointe. */}
                          <div className="shrink-0">
                            <FactureUploader
                              modelId={detailOrder.modelId && detailOrder.modelId !== 'MANUAL' ? detailOrder.modelId : detailOrder.id}
                              materialName={`FRAIS#${exp.id}`}
                              displayName={exp.label}
                            />
                          </div>
                          <button
                            type="button"
                            disabled={expenseSaving}
                            onClick={() => handleDeleteExpense(detailOrder, exp.id)}
                            title={tx(lang,{fr:'Supprimer ce frais',ar:'حذف هاد المصروف',en:'Delete this expense',es:'Eliminar este gasto',pt:'Eliminar esta despesa',tr:'Bu masrafı sil'})}
                            className="p-1.5 rounded-lg text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-40 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Formulaire d'ajout inline */}
                  <div className="pt-3 border-t border-slate-100 dark:border-dk-border space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                      <div className="sm:col-span-3 space-y-1">
                        <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px]">
                          {tx(lang,{fr:'Libellé',ar:'التسمية',en:'Label',es:'Etiqueta',pt:'Rótulo',tr:'Etiket'})}
                        </label>
                        <input
                          type="text"
                          value={expenseLabel}
                          onChange={(e) => setExpenseLabel(e.target.value)}
                          placeholder={tx(lang,{fr:'Transport, patronage, repassage…',ar:'نقل، باترون، تصفيح…',en:'Transport, pattern making, ironing…',es:'Transporte, patronaje, planchado…',pt:'Transporte, modelagem, engomadoria…',tr:'Nakliye, kalıp, ütü…'})}
                          className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-2 text-[11px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                        />
                      </div>
                      <div className="sm:col-span-2 space-y-1">
                        <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px]">
                          {tx(lang,{fr:'Montant',ar:'المبلغ',en:'Amount',es:'Importe',pt:'Montante',tr:'Tutar'})} ({currency})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={expenseAmount}
                          onChange={(e) => setExpenseAmount(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-2 text-[11px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-2.5">
                      <div className="flex rounded-lg border border-slate-200 dark:border-dk-border overflow-hidden">
                        {([
                          { key: 'ALL' as const, label: tx(lang,{fr:'Toute la commande',ar:'الطلبية كاملة',en:'Whole order',es:'Todo el pedido',pt:'Toda a encomenda',tr:'Tüm sipariş'}) },
                          { key: 'PARTIAL' as const, label: tx(lang,{fr:'Quantité partielle',ar:'كمية جزئية',en:'Partial quantity',es:'Cantidad parcial',pt:'Quantidade parcial',tr:'Kısmi miktar'}) },
                        ]).map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setExpenseScopeMode(opt.key)}
                            className={`px-3 py-2 text-[10px] font-bold transition-colors ${expenseScopeMode === opt.key ? 'bg-indigo-50 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text' : 'bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {expenseScopeMode === 'PARTIAL' && (
                        <input
                          type="number"
                          min={1}
                          max={detailOrder.totalQuantity}
                          value={expenseQuantityScope}
                          onChange={(e) => setExpenseQuantityScope(e.target.value === '' ? '' : Math.min(detailOrder.totalQuantity, Math.max(1, parseInt(e.target.value) || 1)))}
                          placeholder={`1 – ${detailOrder.totalQuantity}`}
                          className="w-28 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-2 text-[11px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                        />
                      )}

                      <button
                        type="button"
                        disabled={expenseSaving || !expenseLabel.trim() || !(Number(expenseAmount) > 0)}
                        onClick={() => handleAddExpense(detailOrder)}
                        className="ml-auto bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent/90 text-white px-4 py-2 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 disabled:opacity-60 border border-indigo-600 dark:border-dk-accent"
                      >
                        {expenseSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        <span>{tx(lang,{fr:'Ajouter le frais',ar:'إضافة المصروف',en:'Add expense',es:'Añadir gasto',pt:'Adicionar despesa',tr:'Masraf ekle'})}</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-dk-border">
                    <span className="font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide text-[10px]">
                      {tx(lang,{fr:'Total des frais',ar:'مجموع المصاريف',en:'Total expenses',es:'Total de gastos',pt:'Total das despesas',tr:'Toplam masraf'})}
                    </span>
                    <span className="font-extrabold text-slate-800 dark:text-dk-text">
                      {fmt(orderExpenses.reduce((a, e) => a + e.amount, 0))} {currency}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reçu vs commandé, cellule par cellule. Les trois compteurs
                  ci-dessous ne disent QUE des totaux : ils ne permettent pas de
                  voir quelle couleur et quelle taille manquent encore. */}
              {(() => {
                const fiche: any = models.find(m => m.id === detailOrder.modelId)?.ficheData || {};
                const colors: Array<{ id: string; name: string }> = fiche.colors || [];
                const sizes: string[] = fiche.sizes || [];
                const gq: Record<string, number> = fiche.gridQuantities || {};
                if (colors.length === 0 || sizes.length === 0) return null;

                const entre: Record<string, number> = {};
                detailEntries.forEach(en => {
                  const k = `${en.couleur || ''}|${en.taille || ''}`;
                  entre[k] = (entre[k] || 0) + (Number(en.quantite) || 0);
                });

                let totalCmd = 0;
                let totalEntre = 0;
                colors.forEach(c => sizes.forEach((sz, i) => {
                  totalCmd += Number(gq[`${c.id}_${i}`]) || 0;
                  totalEntre += entre[`${c.name}|${sz}`] || 0;
                }));

                return (
                  <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">
                        {tx(lang,{fr:'Pièces livrées — reçu vs commandé',ar:'القطع المسلَّمة — المُستلَم مقابل المطلوب',en:'Delivered pieces — received vs ordered',es:'Piezas entregadas — recibido vs pedido',pt:'Peças entregues — recebido vs encomendado',tr:'Teslim edilen parçalar — alınan / sipariş'})}
                      </h4>
                      <span className="text-[9px] font-bold text-slate-500 dark:text-dk-muted">
                        {totalEntre.toLocaleString()} / {totalCmd.toLocaleString()} pcs
                        {totalCmd > totalEntre && (
                          <span className="text-amber-700 dark:text-amber-400">
                            {' · '}{tx(lang,{fr:'reste',ar:'المتبقي',en:'remaining',es:'resta',pt:'resta',tr:'kalan'})} {(totalCmd - totalEntre).toLocaleString()}
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Les trois qualités, en bandeau plutôt qu'en cartes séparées :
                        elles répondent à la même question que le tableau ci-dessous
                        et n'ont plus à occuper un bloc entier. */}
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-dk-border flex flex-wrap items-center gap-2">
                      {([
                        { k: 'a', v: detailOrder.qtyAccepted || 0, label: tx(lang,{fr:'Acceptées',ar:'مقبولة',en:'Accepted',es:'Aceptadas',pt:'Aceites',tr:'Kabul'}), cls: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' },
                        { k: 'r', v: detailOrder.qtyToRepair || 0, label: tx(lang,{fr:'À retoucher',ar:'قيد التعديل',en:'To rework',es:'Por retocar',pt:'Por retocar',tr:'Rötuş'}), cls: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50' },
                        { k: 'x', v: detailOrder.qtyRejected || 0, label: tx(lang,{fr:'Rejetées',ar:'مرفوضة',en:'Rejected',es:'Rechazadas',pt:'Rejeitadas',tr:'Red'}), cls: 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/50' },
                      ]).map(q => (
                        <span key={q.k} className={`inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${q.cls}`}>
                          <span className="uppercase tracking-wide opacity-80">{q.label}</span>
                          <span className="text-[12px] font-extrabold">{q.v.toLocaleString()}</span>
                          <span className="opacity-70">pcs</span>
                        </span>
                      ))}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="text-slate-400 dark:text-dk-muted uppercase text-[9px] border-b border-slate-100 dark:border-dk-border">
                          <tr>
                            <th className="px-3 py-1.5 text-left font-medium">{tx(lang,{fr:'Couleur',ar:'اللون',en:'Color',es:'Color',pt:'Cor',tr:'Renk'})}</th>
                            {sizes.map(sz => <th key={sz} className="px-2 py-1.5 text-center font-medium">{sz}</th>)}
                            <th className="px-3 py-1.5 text-right font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                          {colors.map(c => {
                            let rowCmd = 0;
                            let rowEntre = 0;
                            return (
                              <tr key={c.id}>
                                <td className="px-3 py-1.5 font-bold text-slate-700 dark:text-dk-text-soft whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><ColorDot hex={colorHexOf(c.name)} />{c.name}</span></td>
                                {sizes.map((sz, i) => {
                                  const cmd = Number(gq[`${c.id}_${i}`]) || 0;
                                  const got = entre[`${c.name}|${sz}`] || 0;
                                  rowCmd += cmd;
                                  rowEntre += got;
                                  if (cmd === 0 && got === 0) {
                                    return <td key={sz} className="px-2 py-1.5 text-center text-slate-300 dark:text-dk-muted">—</td>;
                                  }
                                  // Vert = complet, ambre = partiel, rose = rien reçu.
                                  const tone = got >= cmd
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : got > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
                                  return (
                                    <td key={sz} className={`px-2 py-1.5 text-center font-bold ${tone}`}>
                                      {got}<span className="text-slate-300 dark:text-dk-muted font-normal">/{cmd}</span>
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-1.5 text-right font-bold text-slate-700 dark:text-dk-text-soft">
                                  {rowEntre}<span className="text-slate-300 dark:text-dk-muted font-normal">/{rowCmd}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {detailOrder.notes && (
                <div className="bg-indigo-50 dark:bg-dk-elevated/70 p-3.5 border border-indigo-100 rounded-xl">
                  <span className="text-[10px] font-bold text-indigo-700 dark:text-dk-accent block uppercase tracking-wide">{tx(lang,{fr:'Instructions',ar:'تعليمات',en:'Instructions',es:'Instrucciones',pt:'Instruções',tr:'Talimatlar'})}</span>
                  <p className="mt-1 font-semibold text-indigo-950 dark:text-dk-accent italic">{detailOrder.notes}</p>
                </div>
              )}

              {detailOrder.modelId && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-dk-border">
                  <InlineInvoiceList
                    key={invoiceListKey}
                    productId={detailOrder.modelId}
                    productLabel={detailOrder.modelName || ''}
                    sourceModule="sousTraitance"
                  />
                </div>
              )}
            </div>

            <div className="bg-slate-50 dark:bg-dk-bg border-t border-slate-100 dark:border-dk-border px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap gap-2 sm:gap-3 items-center text-xs font-bold sticky bottom-0">
              {/* L'entrée en stock est une opération de production, pas un
                  document : elle reste à gauche, séparée des actions
                  d'impression et de facturation. */}
              <button
                onClick={() => openStockEntries(detailOrder)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm dark:shadow-none transition-all mr-auto"
              >
                <Package className="w-4 h-4" />
                <span>{tx(lang,{fr:'Entrer en stock',ar:'إدخال للمخزون',en:'Add to stock',es:'Entrar en stock',pt:'Entrar em stock',tr:'Stoğa gir'})}</span>
              </button>
              <button 
                onClick={() => openBonEnvoiModal(detailOrder)}
                className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated text-slate-700 dark:text-dk-text-soft px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm dark:shadow-none transition-all"
                title={tx(lang,{fr:"Préparer le bon avant impression",ar:'تحضير المذكرة قبل الطباعة',en:'Prepare the note before printing',es:'Preparar el bono antes de imprimir',pt:'Preparar a nota antes de imprimir',tr:'Yazdırmadan önce irsaliyeyi hazırla'})}
              >
                <Printer className="w-4 h-4" />
                <span>{tx(lang,{fr:"Imprimer Bon d'Envoi",ar:'طباعة مذكرة الإرسال',en:'Print Delivery Note',es:'Imprimir Nota de Envío',pt:'Imprimir Nota de Remessa',tr:'Sevk İrsaliyesi Yazdır'})}</span>
              </button>
              <button
                onClick={() => openCostInvoiceModal(detailOrder)}
                className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated text-slate-700 dark:text-dk-text-soft px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm dark:shadow-none transition-all"
                title={tx(lang,{fr:'Facture de ce que vous devez payer au sous-traitant',ar:'فاتورة ديال اللي خاصك تخلّص للمقاول من الباطن',en:'Invoice of what you owe the subcontractor',es:'Factura de lo que debe pagar al subcontratista',pt:'Fatura do que deve pagar ao subcontratado',tr:'Taşerona ödemeniz gerekenin faturası'})}
              >
                <Coins className="w-4 h-4" />
                <span>{tx(lang,{fr:'Facturer',ar:'فوترة',en:'Invoice',es:'Facturar',pt:'Faturar',tr:'Faturala'})}</span>
              </button>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl shadow dark:shadow-dk-sm transition-all border border-indigo-600 dark:border-dk-accent"
              >
                {tx(lang,{fr:'Fermer',ar:'إغلاق',en:'Close',es:'Cerrar',pt:'Fechar',tr:'Kapat'})}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/* C — FACTURE SOUS-TRAITANCE (À PAYER)   */}
      {/* Distincte de la facture de VENTE : ici */}
      {/* on facture ce que VOUS devez au        */}
      {/* sous-traitant pour cette commande.     */}
      {/* ======================================= */}
      {isCostInvoiceModalOpen && costInvoiceOrder && (() => {
        const order = costInvoiceOrder;
        const inv = buildCostInvoice(order, Number(costInvoiceQty) || 0);
        const identityIncomplete = !companyIdentity.nom || !companyIdentity.ice;
        return (
          <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] z-[200] flex items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <div className="relative my-auto bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-none sm:rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-none sm:max-w-2xl overflow-hidden flex flex-col h-[100dvh] sm:h-auto max-h-none sm:max-h-[90vh] text-slate-800 dark:text-dk-text">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-surface/55">
                <h2 className="font-bold text-slate-800 dark:text-dk-text text-base flex items-center gap-2">
                  <Coins className="w-5 h-5 text-indigo-600 dark:text-dk-accent" />
                  <span>{tx(lang,{fr:'Facture de sous-traitance (à payer)',ar:'فاتورة المقاولة من الباطن (للأداء)',en:'Subcontract invoice (payable)',es:'Factura de subcontratación (a pagar)',pt:'Fatura de subcontratação (a pagar)',tr:'Taşeron faturası (ödenecek)'})}</span>
                </h2>
                <button onClick={() => setIsCostInvoiceModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-600 dark:text-dk-text-soft">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-dk-surface/75 p-4 rounded-xl border border-slate-200 dark:border-dk-border">
                  <div className="min-w-0">
                    <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Sous-traitant',ar:'المقاول من الباطن',en:'Subcontractor',es:'Subcontratista',pt:'Subcontratado',tr:'Taşeron'})}</span>
                    <span className="font-bold text-slate-800 dark:text-dk-text block truncate">{order.subcontractorName}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Modèle',ar:'الموديل',en:'Model',es:'Modelo',pt:'Modelo',tr:'Model'})}</span>
                    <span className="font-bold text-slate-800 dark:text-dk-text block truncate">{order.modelName || order.modelId}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Quantité commandée',ar:'الكمية المطلوبة',en:'Ordered quantity',es:'Cantidad pedida',pt:'Quantidade encomendada',tr:'Sipariş miktarı'})}</span>
                    <span className="font-bold text-slate-800 dark:text-dk-text">{order.totalQuantity.toLocaleString()} pcs</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                    {tx(lang,{fr:'Quantité à facturer',ar:'الكمية المراد فوترتها',en:'Quantity to invoice',es:'Cantidad a facturar',pt:'Quantidade a faturar',tr:'Faturalanacak miktar'})}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={costInvoiceQty}
                    onChange={(e) => setCostInvoiceQty(
                      // Plus de plafond à la quantité commandée : une livraison
                      // excédentaire se facture aussi.
                      e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1)
                    )}
                    className="w-full sm:w-56 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white"
                  />
                  {inv.isPartial && (
                    <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      {tx(lang,{
                        fr:`Facturation partielle : ${inv.qty} sur ${order.totalQuantity} pièces.`,
                        ar:`فوترة جزئية: ${inv.qty} من ${order.totalQuantity} قطعة.`,
                        en:`Partial invoicing: ${inv.qty} of ${order.totalQuantity} pieces.`,
                        es:`Facturación parcial: ${inv.qty} de ${order.totalQuantity} piezas.`,
                        pt:`Faturação parcial: ${inv.qty} de ${order.totalQuantity} peças.`,
                        tr:`Kısmi faturalama: ${order.totalQuantity} adetten ${inv.qty} adet.`,
                      })}
                    </p>
                  )}
                </div>

                {expensesError && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="text-[10px] font-semibold leading-relaxed">{expensesError}</span>
                  </div>
                )}

                {/* Groupes cumulables : chaque bouton ALLUME ou ÉTEINT sa famille de
                    lignes, au lieu de repartir d'une sélection unique. On facture
                    ainsi « façon + frais » sans les matières, et tout reste
                    ajustable ligne à ligne ensuite. */}
                {(() => {
                  const matKeys = inv.allMaterials.map(m => `mat-${m.id}`);
                  const expKeys = inv.allExpenses.map(e => `exp-${e.expense.id}`);
                  const groups = [
                    { id: 'facon', keys: ['facon'], label: tx(lang,{fr:'Façon',ar:'الخياطة',en:'Making',es:'Confección',pt:'Confeção',tr:'Fason'}) },
                    { id: 'mat', keys: matKeys, label: tx(lang,{fr:'Matières',ar:'المواد',en:'Materials',es:'Materias',pt:'Matérias',tr:'Malzemeler'}) },
                    { id: 'exp', keys: expKeys, label: tx(lang,{fr:'Frais',ar:'المصاريف',en:'Expenses',es:'Gastos',pt:'Encargos',tr:'Masraflar'}) },
                  ].filter(g => g.keys.length > 0);

                  const allKeys = groups.flatMap(g => g.keys);
                  const allOn = allKeys.every(k => !costInvoiceOff.has(k));

                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-dk-muted">
                        {tx(lang,{fr:'Facturer',ar:'فوترة',en:'Invoice',es:'Facturar',pt:'Faturar',tr:'Faturala'})}
                      </span>

                      <button
                        type="button"
                        onClick={() => setCostInvoiceOff(allOn ? new Set(allKeys) : new Set())}
                        className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-colors ${
                          allOn
                            ? 'bg-indigo-600 dark:bg-dk-accent border-indigo-600 dark:border-dk-accent text-white'
                            : 'border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated'
                        }`}
                      >
                        {tx(lang,{fr:'Tout',ar:'الكل',en:'Everything',es:'Todo',pt:'Tudo',tr:'Hepsi'})}
                      </button>

                      {groups.map(g => {
                        const on = g.keys.every(k => !costInvoiceOff.has(k));
                        const partial = !on && g.keys.some(k => !costInvoiceOff.has(k));
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setCostInvoiceOff(prev => {
                              const next = new Set(prev);
                              // Un groupe partiellement coché s'aligne d'abord sur « tout coché » :
                              // c'est le geste attendu quand on clique dessus.
                              if (on) g.keys.forEach(k => next.add(k));
                              else g.keys.forEach(k => next.delete(k));
                              return next;
                            })}
                            className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-colors flex items-center gap-1 ${
                              on
                                ? 'bg-indigo-50 dark:bg-dk-accent/20 border-indigo-300 dark:border-dk-accent/60 text-indigo-700 dark:text-dk-accent'
                                : partial
                                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/60 text-amber-700 dark:text-amber-400'
                                  : 'border-slate-200 dark:border-dk-border text-slate-400 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated'
                            }`}
                          >
                            {on && <Check className="w-3 h-3" />}
                            {g.label}
                            {g.keys.length > 1 && <span className="opacity-60">({g.keys.length})</span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border">
                    <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">
                      {tx(lang,{fr:'Détail de la facture',ar:'تفصيل الفاتورة',en:'Invoice breakdown',es:'Detalle de la factura',pt:'Detalhe da fatura',tr:'Fatura dökümü'})}
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-white dark:bg-dk-surface text-slate-400 dark:text-dk-muted uppercase tracking-wide text-[9px] border-b border-slate-100 dark:border-dk-border">
                        <tr>
                          <th className="pl-4 pr-1 py-2 text-left font-medium w-8">{tx(lang,{fr:'Incl.',ar:'ضمّ',en:'Incl.',es:'Incl.',pt:'Incl.',tr:'Dahil'})}</th>
                          <th className="px-4 py-2 text-left font-medium">{tx(lang,{fr:'Désignation',ar:'البيان',en:'Description',es:'Designación',pt:'Designação',tr:'Açıklama'})}</th>
                          <th className="px-4 py-2 text-right font-medium">{tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})}</th>
                          <th className="px-4 py-2 text-right font-medium">{tx(lang,{fr:'P.U.',ar:'س.و.',en:'Unit',es:'P.U.',pt:'P.U.',tr:'B.F.'})}</th>
                          <th className="px-4 py-2 text-right font-medium">{tx(lang,{fr:'Total',ar:'المجموع',en:'Total',es:'Total',pt:'Total',tr:'Toplam'})}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                        <tr className={inv.faconOn ? '' : 'opacity-45 line-through'}>
                          <td className="pl-4 pr-1 py-2">
                            <input
                              type="checkbox"
                              checked={inv.faconOn}
                              onChange={() => toggleCostLine('facon')}
                              className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer align-middle"
                            />
                          </td>
                          <td className="px-4 py-2 font-semibold text-slate-700 dark:text-dk-text-soft">
                            <span className="text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Façon',ar:'الخياطة',en:'Making',es:'Confección',pt:'Confeção',tr:'Fason'})} — </span>
                            <input
                              type="text"
                              value={inv.faconView.label}
                              onChange={e => editCostLine('facon', { label: e.target.value })}
                              className="bg-transparent border-b border-dashed border-slate-300 dark:border-dk-border focus:border-indigo-500 outline-none px-0.5 min-w-0 w-40"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">{inv.qty.toLocaleString()} pcs</td>
                          <td className="px-4 py-2 text-right">{fmt(inv.unitPrice)} {currency}</td>
                          <td className="px-4 py-2 text-right font-bold text-slate-700 dark:text-dk-text-soft">
                            <MoneyCell
                              value={inv.faconView.amount}
                              edited={inv.faconView.edited}
                              currency={currency}
                              onChange={v => editCostLine('facon', { amount: v })}
                              onReset={() => resetCostLine('facon')}
                            />
                          </td>
                        </tr>

                        {inv.allMaterials.map(m => (
                          <tr key={`mat-${m.id}`} className={costInvoiceOff.has(`mat-${m.id}`) ? 'opacity-45 line-through' : ''}>
                            <td className="pl-4 pr-1 py-2">
                              <input
                                type="checkbox"
                                checked={!costInvoiceOff.has(`mat-${m.id}`)}
                                onChange={() => toggleCostLine(`mat-${m.id}`)}
                                className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer align-middle"
                              />
                            </td>
                            <td className="px-4 py-2 text-slate-600 dark:text-dk-text-soft">
                              <span className="text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Matière',ar:'مادة',en:'Material',es:'Material',pt:'Material',tr:'Malzeme'})} — </span>
                              <input
                                type="text"
                                value={m.label}
                                onChange={e => editCostLine(`mat-${m.id}`, { label: e.target.value })}
                                className="bg-transparent border-b border-dashed border-slate-300 dark:border-dk-border focus:border-indigo-500 outline-none px-0.5 min-w-0 w-36"
                              />
                              <MaterialPriceBadge source={m.priceSource} lang={lang} />
                            </td>
                            <td className="px-4 py-2 text-right">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={m.qty}
                                onChange={e => editCostLine(`mat-${m.id}`, { qty: e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value) || 0) })}
                                className={`w-16 text-right bg-transparent border-b border-dashed outline-none px-0.5 ${m.qtyEdited ? 'border-indigo-400 text-indigo-700 dark:text-dk-accent font-bold' : 'border-slate-300 dark:border-dk-border'}`}
                              />
                              <span className="ml-1 text-slate-400 dark:text-dk-muted">{m.unit}</span>
                            </td>
                            <td className="px-4 py-2 text-right">{fmt(m.unitPrice)} {currency}</td>
                            <td className="px-4 py-2 text-right font-bold text-slate-700 dark:text-dk-text-soft">
                              <MoneyCell
                                value={m.amount}
                                edited={m.edited}
                                currency={currency}
                                onChange={v => editCostLine(`mat-${m.id}`, { amount: v })}
                                onReset={() => resetCostLine(`mat-${m.id}`)}
                              />
                            </td>
                          </tr>
                        ))}

                        {inv.allExpenses.map(({ expense, applied, label, amount, edited }) => (
                          <tr key={`exp-${expense.id}`} className={costInvoiceOff.has(`exp-${expense.id}`) ? 'opacity-45 line-through' : ''}>
                            <td className="pl-4 pr-1 py-2">
                              <input
                                type="checkbox"
                                checked={!costInvoiceOff.has(`exp-${expense.id}`)}
                                onChange={() => toggleCostLine(`exp-${expense.id}`)}
                                className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer align-middle"
                              />
                            </td>
                            <td className="px-4 py-2 text-slate-600 dark:text-dk-text-soft">
                              <span className="text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Frais',ar:'مصروف',en:'Expense',es:'Gasto',pt:'Despesa',tr:'Masraf'})} — </span>
                              <input
                                type="text"
                                value={label}
                                onChange={e => editCostLine(`exp-${expense.id}`, { label: e.target.value })}
                                className="bg-transparent border-b border-dashed border-slate-300 dark:border-dk-border focus:border-indigo-500 outline-none px-0.5 min-w-0 w-36"
                              />
                              <span className="block text-[9px] text-slate-400 dark:text-dk-muted">
                                {expense.quantity_scope == null
                                  ? tx(lang,{fr:'Toute la commande',ar:'الطلبية كاملة',en:'Whole order',es:'Todo el pedido',pt:'Toda a encomenda',tr:'Tüm sipariş'})
                                  : `${expense.quantity_scope.toLocaleString()} pcs`}
                                {applied < expense.amount - 0.005 && (
                                  <> · {tx(lang,{fr:'au prorata',ar:'بالتناسب',en:'pro rata',es:'a prorrata',pt:'pro rata',tr:'orantılı'})} ({fmt(expense.amount)} {currency})</>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-slate-300 dark:text-dk-muted">—</td>
                            <td className="px-4 py-2 text-right text-slate-300 dark:text-dk-muted">—</td>
                            <td className="px-4 py-2 text-right font-bold text-slate-700 dark:text-dk-text-soft">
                              <MoneyCell
                                value={amount}
                                edited={edited}
                                currency={currency}
                                onChange={v => editCostLine(`exp-${expense.id}`, { amount: v })}
                                onReset={() => resetCostLine(`exp-${expense.id}`)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 dark:bg-dk-bg/60 border-t border-slate-200 dark:border-dk-border">
                        <tr>
                          <td colSpan={4} className="px-4 py-3 font-bold uppercase tracking-wide text-[10px] text-slate-600 dark:text-dk-text-soft">
                            {tx(lang,{fr:'Total HT brut',ar:'المجموع الخام دون الضريبة',en:'Gross total excl. tax',es:'Total bruto sin IVA',pt:'Total bruto sem IVA',tr:'Brüt KDV hariç toplam'})}
                          </td>
                          <td className="px-4 py-3 text-right font-extrabold text-indigo-600 dark:text-dk-accent text-sm">{fmt(inv.totalBrut)} {currency}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {inv.excludedCount > 0 && (
                    <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800/50 text-[10px] font-semibold text-amber-800 dark:text-amber-400">
                      {tx(lang,{
                        fr:`${inv.excludedCount} ligne(s) exclue(s) : elles n'apparaîtront ni sur la facture imprimée ni sur la facture enregistrée.`,
                        ar:`${inv.excludedCount} سطر مُستثنى: ما غاديش يبان لا فالفاتورة المطبوعة لا فالمسجّلة.`,
                        en:`${inv.excludedCount} excluded line(s): they will appear neither on the printed nor on the saved invoice.`,
                        es:`${inv.excludedCount} línea(s) excluida(s): no aparecerán ni en la factura impresa ni en la guardada.`,
                        pt:`${inv.excludedCount} linha(s) excluída(s): não aparecerão nem na fatura impressa nem na guardada.`,
                        tr:`${inv.excludedCount} satır hariç tutuldu: ne yazdırılan ne de kaydedilen faturada görünecek.`,
                      })}
                    </div>
                  )}
                </div>

                {/* Conditions de facturation : dates, remise, TVA et acompte.
                    Tout est visible AVANT d'enregistrer ou d'imprimer, parce
                    qu'une facture corrigée après coup n'existe pas — il faut un
                    avoir. */}
                <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border">
                    <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">
                      {tx(lang,{fr:'Conditions & montants',ar:'الشروط والمبالغ',en:'Terms & amounts',es:'Condiciones e importes',pt:'Condições e montantes',tr:'Koşullar ve tutarlar'})}
                    </h4>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                        {tx(lang,{fr:'Date de facture',ar:'تاريخ الفاتورة',en:'Invoice date',es:'Fecha de factura',pt:'Data da fatura',tr:'Fatura tarihi'})}
                      </label>
                      <input
                        type="date"
                        value={inv.dateFacture}
                        onChange={e => setCostInvoiceDate(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                        {tx(lang,{fr:'Date d\'échéance',ar:'تاريخ الاستحقاق',en:'Due date',es:'Fecha de vencimiento',pt:'Data de vencimento',tr:'Vade tarihi'})}
                      </label>
                      <input
                        type="date"
                        value={inv.dueDate}
                        onChange={e => setCostInvoiceDueDate(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                      />
                      <p className="text-[9px] text-slate-400 dark:text-dk-muted">
                        {tx(lang,{fr:'Déduite des conditions de paiement de la commande.',ar:'مستنتجة من شروط أداء الطلبية.',en:'Derived from the order payment terms.',es:'Deducida de las condiciones de pago del pedido.',pt:'Deduzida das condições de pagamento da encomenda.',tr:'Siparişin ödeme koşullarından türetilmiştir.'})}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                        {tx(lang,{fr:'Remise',ar:'التخفيض',en:'Discount',es:'Descuento',pt:'Desconto',tr:'İndirim'})}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={costInvoiceDiscount}
                          onChange={e => setCostInvoiceDiscount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                          className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                        />
                        <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-dk-border shrink-0">
                          {(['PCT', 'AMOUNT'] as const).map(mode => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setCostInvoiceDiscountMode(mode)}
                              className={`px-2 py-1.5 text-[10px] font-bold transition-colors ${costInvoiceDiscountMode === mode ? 'bg-indigo-600 dark:bg-dk-accent text-white' : 'bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted'}`}
                            >
                              {mode === 'PCT' ? '%' : currency}
                            </button>
                          ))}
                        </div>
                      </div>
                      {inv.discount > 0 && (
                        <p className="text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                          - {fmt(inv.discount)} {currency}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                        {tx(lang,{fr:'Acompte déjà versé',ar:'تسبيق مؤدى',en:'Advance already paid',es:'Anticipo ya pagado',pt:'Adiantamento já pago',tr:'Ödenmiş avans'})}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={costInvoiceAcompte}
                        onChange={e => setCostInvoiceAcompte(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                        className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                      />
                      <p className="text-[9px] text-slate-400 dark:text-dk-muted">
                        {tx(lang,{fr:'Ne diminue pas la facture : seulement le reste à payer.',ar:'ما كيّنقصش الفاتورة: غير الباقي للأداء.',en:'Does not reduce the invoice: only the balance due.',es:'No reduce la factura: solo el resto a pagar.',pt:'Não reduz a fatura: apenas o saldo em dívida.',tr:'Faturayı değil, yalnızca kalan borcu azaltır.'})}
                      </p>
                    </div>

                    <label className="sm:col-span-2 flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={inv.exonerated}
                        onChange={e => setCostInvoiceExo(e.target.checked)}
                        className="w-3.5 h-3.5 accent-indigo-600 mt-0.5"
                      />
                      <span className="text-[10px] font-bold text-slate-600 dark:text-dk-text-soft">
                        {tx(lang,{fr:'Exonéré de TVA (marché export — art. 92 CGI)',ar:'معفى من الضريبة على القيمة المضافة (سوق التصدير — المادة 92)',en:'VAT exempt (export market — art. 92)',es:'Exento de IVA (mercado de exportación — art. 92)',pt:'Isento de IVA (mercado de exportação — art. 92)',tr:'KDV muaf (ihracat pazarı — madde 92)'})}
                        <span className="block font-semibold text-slate-400 dark:text-dk-muted">
                          {tx(lang,{fr:'Coché automatiquement si le modèle est en marché Export.',ar:'كيتشيك أوتوماتيكياً إلا كان الموديل ديال التصدير.',en:'Ticked automatically when the model is an export order.',es:'Marcado automáticamente si el modelo es de exportación.',pt:'Marcado automaticamente se o modelo for de exportação.',tr:'Model ihracat pazarındaysa otomatik işaretlenir.'})}
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* Récapitulatif « ce que je paie » — un seul endroit où lire le
                      chemin brut → remise → TVA → acompte → reste. */}
                  <div className="border-t border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/60 p-4 space-y-1.5 text-[11px]">
                    {([
                      { label: tx(lang,{fr:'Total HT brut',ar:'المجموع الخام دون الضريبة',en:'Gross total excl. tax',es:'Total bruto sin IVA',pt:'Total bruto sem IVA',tr:'Brüt KDV hariç toplam'}), value: inv.totalBrut },
                      ...(inv.discount > 0 ? [{ label: tx(lang,{fr:'Remise',ar:'التخفيض',en:'Discount',es:'Descuento',pt:'Desconto',tr:'İndirim'}), value: -inv.discount }] : []),
                      ...(inv.discount > 0 ? [{ label: tx(lang,{fr:'Net HT',ar:'الصافي دون الضريبة',en:'Net excl. tax',es:'Neto sin IVA',pt:'Líquido sem IVA',tr:'Net KDV hariç'}), value: inv.netHT }] : []),
                      { label: `${tx(lang,{fr:'TVA',ar:'الضريبة',en:'VAT',es:'IVA',pt:'IVA',tr:'KDV'})} ${inv.tvaRate}%`, value: inv.tvaAmount },
                    ]).map((row, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-dk-muted font-semibold">{row.label}</span>
                        <span className="font-bold text-slate-700 dark:text-dk-text-soft">{fmt(row.value)} {currency}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 dark:border-dk-border">
                      <span className="font-black uppercase tracking-wide text-[10px] text-slate-600 dark:text-dk-text-soft">
                        {tx(lang,{fr:'Total TTC',ar:'المجموع مع الضريبة',en:'Total incl. tax',es:'Total con IVA',pt:'Total com IVA',tr:'Toplam (KDV dahil)'})}
                      </span>
                      <span className="font-extrabold text-indigo-600 dark:text-dk-accent text-sm">{fmt(inv.totalTTC)} {currency}</span>
                    </div>
                    {inv.acompte > 0 && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            {tx(lang,{fr:'Déjà payé',ar:'المؤدى سابقاً',en:'Already paid',es:'Ya pagado',pt:'Já pago',tr:'Ödenmiş'})}
                          </span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">- {fmt(inv.acompte)} {currency}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 dark:border-dk-border">
                          <span className="font-black uppercase tracking-wide text-[10px] text-slate-600 dark:text-dk-text-soft">
                            {tx(lang,{fr:'Reste à payer',ar:'الباقي للأداء',en:'Balance due',es:'Resto a pagar',pt:'Restante a pagar',tr:'Kalan borç'})}
                          </span>
                          <span className="font-extrabold text-indigo-600 dark:text-dk-accent text-sm">{fmt(inv.resteAPayer)} {currency}</span>
                        </div>
                      </>
                    )}
                    <p className="pt-2 text-[10px] text-slate-500 dark:text-dk-muted leading-relaxed">
                      <span className="font-bold">{tx(lang,{fr:'En toutes lettres',ar:'بالحروف',en:'In words',es:'En letras',pt:'Por extenso',tr:'Yazıyla'})} : </span>
                      {inv.words.fr}
                      <span className="block" dir="rtl">{inv.words.ar}</span>
                    </p>
                  </div>
                </div>

                {/* Identité du BÉNÉFICIAIRE — pré-remplie depuis sa fiche, corrigible
                    ici : une facture d'achat sans ICE ni RC n'est pas exploitable
                    comptablement, et l'information arrive parfois au dernier moment.
                    La correction vaut pour CETTE facture ; la fiche reste la source. */}
                <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border">
                    <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">
                      {tx(lang,{fr:'Infos sous-traitant (bénéficiaire)',ar:'معلومات السوطراطور (المستفيد)',en:'Subcontractor info (payee)',es:'Datos del subcontratista (beneficiario)',pt:'Dados do subcontratado (beneficiário)',tr:'Taşeron bilgileri (alacaklı)'})}
                    </h4>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([
                      { k: 'nom' as const, label: tx(lang,{fr:'Raison sociale',ar:'الاسم التجاري',en:'Company name',es:'Razón social',pt:'Razão social',tr:'Ticari unvan'}) },
                      { k: 'ice' as const, label: 'ICE' },
                      { k: 'rc' as const, label: 'RC' },
                      { k: 'tel' as const, label: tx(lang,{fr:'Téléphone',ar:'الهاتف',en:'Phone',es:'Teléfono',pt:'Telefone',tr:'Telefon'}) },
                      { k: 'adresse' as const, label: tx(lang,{fr:'Adresse',ar:'العنوان',en:'Address',es:'Dirección',pt:'Morada',tr:'Adres'}) },
                    ]).map(f => (
                      <div key={f.k} className={f.k === 'adresse' ? 'sm:col-span-2' : ''}>
                        <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1">{f.label}</label>
                        <input
                          type="text"
                          value={costInvoiceTiers[f.k]}
                          onChange={e => setCostInvoiceTiers(prev => ({ ...prev, [f.k]: e.target.value }))}
                          className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                        />
                      </div>
                    ))}
                    {(!costInvoiceTiers.ice || !costInvoiceTiers.rc) && (
                      <p className="sm:col-span-2 text-[10px] text-amber-700 dark:text-amber-400 italic">
                        {tx(lang,{fr:'ICE / RC manquants — la facture partira sans eux.',ar:'ICE / RC ناقصين — الفاتورة غادي تمشي بلاهم.',en:'Missing ICE / RC — the invoice will go out without them.',es:'Faltan ICE / RC — la factura saldrá sin ellos.',pt:'ICE / RC em falta — a fatura seguirá sem eles.',tr:'ICE / RC eksik — fatura bunlarsız çıkacak.'})}
                      </p>
                    )}
                  </div>
                </div>

                {/* Identité de l'entreprise — LECTURE SEULE. L'édition vit dans
                    Admin > Entreprise : une seconde saisie ici ferait diverger
                    l'ICE d'une facture à l'autre. */}
                <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border">
                    <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">
                      {tx(lang,{fr:'Infos entreprise (en-tête de la facture)',ar:'معلومات الشركة (رأس الفاتورة)',en:'Company info (invoice header)',es:'Datos de la empresa (encabezado)',pt:'Dados da empresa (cabeçalho)',tr:'Şirket bilgileri (fatura başlığı)'})}
                    </h4>
                  </div>
                  <div className="p-4 space-y-1.5">
                    <p className="font-bold text-slate-800 dark:text-dk-text">
                      {companyIdentity.nom || <span className="text-slate-400 dark:text-dk-muted font-semibold italic">{tx(lang,{fr:'Raison sociale non renseignée',ar:'الاسم التجاري غير محدَّد',en:'Company name not set',es:'Razón social no indicada',pt:'Razão social não indicada',tr:'Ticari unvan girilmedi'})}</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-dk-muted">
                      {[companyIdentity.ice && `ICE : ${companyIdentity.ice}`, companyIdentity.rc && `RC : ${companyIdentity.rc}`].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-dk-muted">
                      {[companyIdentity.adresse, companyIdentity.tel].filter(Boolean).join(' · ') || '—'}
                    </p>
                    {identityIncomplete && (
                      <p className="text-[10px] text-slate-400 dark:text-dk-muted italic pt-1">
                        {tx(lang,{
                          fr:'Complétez les informations légales dans Admin > Entreprise pour les faire apparaître ici.',
                          ar:'كمّل المعلومات القانونية ف Admin > Entreprise باش تبان هنا.',
                          en:'Complete the legal information in Admin > Company to have it appear here.',
                          es:'Complete la información legal en Admin > Empresa para que aparezca aquí.',
                          pt:'Complete as informações legais em Admin > Empresa para que apareçam aqui.',
                          tr:'Burada görünmesi için yasal bilgileri Admin > Şirket bölümünde tamamlayın.',
                        })}
                      </p>
                    )}
                  </div>
                </div>

                {costInvoiceSaveError && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="text-[10px] font-semibold leading-relaxed">{costInvoiceSaveError}</span>
                  </div>
                )}
                {costInvoiceSavedNumber && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400">
                    <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="text-[10px] font-semibold leading-relaxed">
                      {tx(lang,{
                        fr:`Facture enregistrée sous le n° ${costInvoiceSavedNumber} — visible dans "Factures liées".`,
                        ar:`تم تسجيل الفاتورة برقم ${costInvoiceSavedNumber} — تظهر في "الفواتير المرتبطة".`,
                        en:`Invoice saved as #${costInvoiceSavedNumber} — visible in "Related invoices".`,
                        es:`Factura guardada con el n.º ${costInvoiceSavedNumber} — visible en "Facturas relacionadas".`,
                        pt:`Fatura guardada com o n.º ${costInvoiceSavedNumber} — visível em "Faturas relacionadas".`,
                        tr:`Fatura #${costInvoiceSavedNumber} numarasıyla kaydedildi — "İlgili faturalar" içinde görünür.`,
                      })}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 dark:bg-dk-bg border-t border-slate-100 dark:border-dk-border px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 justify-end text-xs font-bold flex-wrap sticky bottom-0">
                <div className="flex items-center gap-1.5 mr-auto">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest">
                    {tx(lang,{fr:'TVA',ar:'الضريبة',en:'VAT',es:'IVA',pt:'IVA',tr:'KDV'})}
                  </label>
                  {/* Champ neutralisé quand la facture est exonérée : afficher un
                      taux saisissable qui ne s'applique pas serait trompeur. */}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={inv.exonerated}
                    value={inv.exonerated ? 0 : costInvoiceTva}
                    onChange={(e) => setCostInvoiceTva(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-16 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1.5 text-[11px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent disabled:opacity-50"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-dk-muted">%</span>
                  {inv.exonerated && (
                    <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase">
                      {tx(lang,{fr:'exonéré',ar:'معفى',en:'exempt',es:'exento',pt:'isento',tr:'muaf'})}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsCostInvoiceModalOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated text-slate-500 dark:text-dk-muted rounded-xl font-bold transition-all"
                >
                  {tx(lang,{fr:'Fermer',ar:'إغلاق',en:'Close',es:'Cerrar',pt:'Fechar',tr:'Kapat'})}
                </button>
                <button
                  type="button"
                  disabled={costInvoiceSaving}
                  onClick={() => handleSaveCostInvoice(order, inv)}
                  className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:bg-slate-100 dark:hover:bg-dk-elevated text-slate-700 dark:text-dk-text-soft px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {costInvoiceSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{tx(lang,{fr:'Enregistrer',ar:'تسجيل',en:'Save',es:'Guardar',pt:'Guardar',tr:'Kaydet'})}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintCostInvoice(order, inv.qty)}
                  className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent/90 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md dark:shadow-dk-md flex items-center gap-2 border border-indigo-600 dark:border-dk-accent"
                >
                  <Printer className="w-4 h-4" />
                  <span>{tx(lang,{fr:'Imprimer',ar:'طباعة',en:'Print',es:'Imprimir',pt:'Imprimir',tr:'Yazdır'})}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======================================= */}
      {/* BON D'ENVOI — PRÉPARATION AVANT IMPRESSION */}
      {/* ======================================= */}
      {isBonEnvoiModalOpen && bonEnvoiOrder && (() => {
        const order = bonEnvoiOrder;
        const baseRows = buildBonEnvoiRows(order);
        const milestones = buildBonEnvoiMilestones(order);
        // Colonnes de tailles, dans l'ordre du modèle : la préparation doit se
        // lire comme la grille de la fiche, pas comme une phrase à décoder.
        const detailLines = buildBonEnvoiDetail(order);
        const beModelSizes: string[] = (((models.find(m => m.id === order.modelId)?.ficheData as any)?.sizes) || []) as string[];
        const beSeen = new Set<string>();
        baseRows.forEach(r => r.detail.forEach(([sz]) => beSeen.add(sz)));
        const beSizeCols = [
          ...beModelSizes.filter(sz => beSeen.has(sz)),
          ...[...beSeen].filter(sz => !beModelSizes.includes(sz)),
        ];
        const shippedTotal = baseRows
          .filter(r => !bonEnvoiOff.has(r.key))
          .reduce((a, r) => a + (bonEnvoiEdits[r.key]?.qty ?? r.total), 0);
        const modelPhoto = models.find(m => m.id === order.modelId)?.image || '';
        const stPhoto = subcontractorProfiles.find(p => p.name === order.subcontractorName)?.photo || '';
        // Bascules d'affichage : libellé + disponibilité réelle du visuel. Une
        // case cochée sans image derrière donnerait un document vide sans le dire.
        const showToggles: { k: keyof typeof bonEnvoiShow; label: string; missing?: boolean }[] = [
          { k: 'logo', label: tx(lang,{fr:'Logo entreprise',ar:'شعار الشركة',en:'Company logo',es:'Logotipo de la empresa',pt:'Logótipo da empresa',tr:'Şirket logosu'}), missing: !companyIdentity.logo },
          { k: 'model', label: tx(lang,{fr:'Photo du modèle',ar:'صورة الموديل',en:'Model photo',es:'Foto del modelo',pt:'Foto do modelo',tr:'Model fotoğrafı'}), missing: !modelPhoto },
          { k: 'subcontractor', label: tx(lang,{fr:'Photo du sous-traitant',ar:'صورة المقاول من الباطن',en:'Subcontractor photo',es:'Foto del subcontratista',pt:'Foto do subcontratado',tr:'Taşeron fotoğrafı'}), missing: !stPhoto },
          { k: 'detail', label: tx(lang,{fr:"Détail de l'envoi",ar:'تفصيل الإرسال',en:'Shipment details',es:'Detalle del envío',pt:'Detalhe da remessa',tr:'Sevkiyat detayı'}) },
          { k: 'sizeDetail', label: tx(lang,{fr:'Détail par taille',ar:'التفصيل حسب المقاس',en:'Detail by size',es:'Detalle por talla',pt:'Detalhe por tamanho',tr:'Beden detayı'}) },
          { k: 'milestones', label: tx(lang,{fr:'Jalons',ar:'المراحل',en:'Milestones',es:'Hitos',pt:'Marcos',tr:'Kilometre taşları'}) },
          { k: 'materials', label: tx(lang,{fr:'Matières à prévoir',ar:'المواد الواجب توفيرها',en:'Materials to provide',es:'Materias a prever',pt:'Matérias a prever',tr:'Sağlanacak malzemeler'}) },
          { k: 'notes', label: tx(lang,{fr:'Notes',ar:'ملاحظات',en:'Notes',es:'Notas',pt:'Notas',tr:'Notlar'}) },
        ];
        const identityFields = ([
          { k: 'nom' as const, label: tx(lang,{fr:'Raison sociale',ar:'الاسم التجاري',en:'Company name',es:'Razón social',pt:'Razão social',tr:'Ticari unvan'}) },
          { k: 'ice' as const, label: 'ICE' },
          { k: 'rc' as const, label: 'RC' },
          { k: 'tel' as const, label: tx(lang,{fr:'Téléphone',ar:'الهاتف',en:'Phone',es:'Teléfono',pt:'Telefone',tr:'Telefon'}) },
          { k: 'adresse' as const, label: tx(lang,{fr:'Adresse',ar:'العنوان',en:'Address',es:'Dirección',pt:'Morada',tr:'Adres'}) },
        ]);
        return (
          <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] z-[200] flex items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <div className="relative my-auto bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-none sm:rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-none sm:max-w-2xl overflow-hidden flex flex-col h-[100dvh] sm:h-auto max-h-none sm:max-h-[90vh] text-slate-800 dark:text-dk-text">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-surface/55">
                <h2 className="font-bold text-slate-800 dark:text-dk-text text-base flex items-center gap-2">
                  <Truck className="w-5 h-5 text-indigo-600 dark:text-dk-accent" />
                  <span>{tx(lang,{fr:"Bon d'envoi — préparation",ar:'مذكرة الإرسال — التحضير',en:'Delivery note — preparation',es:'Nota de envío — preparación',pt:'Nota de remessa — preparação',tr:'Sevk irsaliyesi — hazırlık'})}</span>
                </h2>
                <button onClick={() => setIsBonEnvoiModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-600 dark:text-dk-text-soft">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-dk-surface/75 p-4 rounded-xl border border-slate-200 dark:border-dk-border">
                  <div className="min-w-0">
                    <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Sous-traitant',ar:'المقاول من الباطن',en:'Subcontractor',es:'Subcontratista',pt:'Subcontratado',tr:'Taşeron'})}</span>
                    <span className="font-bold text-slate-800 dark:text-dk-text block truncate">{order.subcontractorName}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Modèle',ar:'الموديل',en:'Model',es:'Modelo',pt:'Modelo',tr:'Model'})}</span>
                    <span className="font-bold text-slate-800 dark:text-dk-text block truncate">{order.modelName || order.modelId}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-dk-muted font-semibold block uppercase text-[10px]">{tx(lang,{fr:'Quantité commandée',ar:'الكمية المطلوبة',en:'Ordered quantity',es:'Cantidad pedida',pt:'Quantidade encomendada',tr:'Sipariş miktarı'})}</span>
                    <span className="font-bold text-slate-800 dark:text-dk-text">{order.totalQuantity.toLocaleString(dateLocale)} pcs</span>
                  </div>
                </div>

                {/* Ce qui figure sur le document. Chaque bascule est un choix
                    d'impression : elle ne modifie jamais la commande. */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-dk-muted">
                    {tx(lang,{fr:'Afficher',ar:'إظهار',en:'Show',es:'Mostrar',pt:'Mostrar',tr:'Göster'})}
                  </span>
                  {showToggles.map(t => {
                    const on = bonEnvoiShow[t.k];
                    return (
                      <button
                        key={t.k}
                        type="button"
                        disabled={t.missing}
                        title={t.missing ? tx(lang,{fr:'Visuel indisponible pour cette commande.',ar:'الصورة غير متوفرة لهذه الطلبية.',en:'Visual unavailable for this order.',es:'Visual no disponible para este pedido.',pt:'Visual indisponível para esta encomenda.',tr:'Bu sipariş için görsel yok.'}) : undefined}
                        onClick={() => setBonEnvoiShow(prev => ({ ...prev, [t.k]: !prev[t.k] }))}
                        className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${
                          on && !t.missing
                            ? 'bg-indigo-50 dark:bg-dk-accent/20 border-indigo-300 dark:border-dk-accent/60 text-indigo-700 dark:text-dk-accent'
                            : 'border-slate-200 dark:border-dk-border text-slate-400 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated'
                        }`}
                      >
                        {on && !t.missing && <Check className="w-3 h-3" />}
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {/* Lignes du bon : ce qui part réellement dans le camion. Une
                    ligne décochée ou corrigée disparaît / change AUSSI dans le
                    total imprimé — le bon ne peut pas se contredire lui-même. */}
                <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">
                      {tx(lang,{fr:"Détail de l'envoi",ar:'تفصيل الإرسال',en:'Shipment details',es:'Detalle del envío',pt:'Detalhe da remessa',tr:'Sevkiyat detayı'})}
                    </h4>
                    <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest">
                      {tx(lang,{fr:'Quantités seules — aucun montant',ar:'كميات فقط — بلا أي مبلغ',en:'Quantities only — no amounts',es:'Solo cantidades — sin importes',pt:'Só quantidades — sem valores',tr:'Yalnızca miktarlar — tutar yok'})}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-white dark:bg-dk-surface text-slate-400 dark:text-dk-muted uppercase tracking-wide text-[9px] border-b border-slate-100 dark:border-dk-border">
                        <tr>
                          <th className="pl-4 pr-1 py-2 text-left font-medium w-8">{tx(lang,{fr:'Incl.',ar:'ضمّ',en:'Incl.',es:'Incl.',pt:'Incl.',tr:'Dahil'})}</th>
                          <th className="px-4 py-2 text-left font-medium">{tx(lang,{fr:'Désignation',ar:'البيان',en:'Description',es:'Designación',pt:'Designação',tr:'Açıklama'})}</th>
                          <th className="px-4 py-2 text-right font-medium">{tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                        {detailLines.map(l => {
                          const on = !bonEnvoiOff.has(l.key);
                          const edit = bonEnvoiEdits[l.key] || {};
                          return (
                            <tr key={l.key} className={on ? '' : 'opacity-45 line-through'}>
                              <td className="pl-4 pr-1 py-2">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleBonEnvoiKey(l.key)}
                                  className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer align-middle"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <span className="text-slate-400 dark:text-dk-muted">{l.type} — </span>
                                <input
                                  type="text"
                                  value={edit.label ?? l.label}
                                  onChange={e => editBonEnvoiRow(l.key, { label: e.target.value })}
                                  className="bg-transparent border-b border-dashed border-slate-300 dark:border-dk-border focus:border-indigo-500 outline-none px-0.5 min-w-0 w-40 font-semibold text-slate-700 dark:text-dk-text-soft"
                                />
                              </td>
                              <td className="px-4 py-2 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={edit.qty ?? l.qty}
                                  onChange={e => editBonEnvoiRow(l.key, { qty: Math.max(0, parseFloat(e.target.value) || 0) })}
                                  className="w-20 text-right bg-transparent border-b border-dashed border-slate-300 dark:border-dk-border focus:border-indigo-500 outline-none px-0.5 font-bold text-slate-700 dark:text-dk-text-soft"
                                />
                                <span className="ml-1 text-slate-400 dark:text-dk-muted">{l.unit}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border flex items-center justify-between gap-2">
                    <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">
                      {tx(lang,{fr:'Pièces envoyées',ar:'القطع المرسلة',en:'Pieces sent',es:'Piezas enviadas',pt:'Peças enviadas',tr:'Gönderilen parçalar'})}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setBonEnvoiOff(prev => (prev.size > 0 ? new Set() : new Set(baseRows.map(r => r.key))))}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-dk-border text-[10px] font-bold text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated"
                    >
                      {tx(lang,{fr:'Tout',ar:'الكل',en:'Everything',es:'Todo',pt:'Tudo',tr:'Hepsi'})}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-white dark:bg-dk-surface text-slate-400 dark:text-dk-muted uppercase tracking-wide text-[9px] border-b border-slate-100 dark:border-dk-border">
                        <tr>
                          <th className="pl-4 pr-1 py-2 text-left font-medium w-8">{tx(lang,{fr:'Incl.',ar:'ضمّ',en:'Incl.',es:'Incl.',pt:'Incl.',tr:'Dahil'})}</th>
                          <th className="px-4 py-2 text-left font-medium">{tx(lang,{fr:'Couleur',ar:'اللون',en:'Color',es:'Color',pt:'Cor',tr:'Renk'})}</th>
                          {beSizeCols.map(sz => (
                            <th key={sz} className="px-2 py-2 text-center font-medium">{sz}</th>
                          ))}
                          <th className="px-4 py-2 text-right font-medium">{tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                        {baseRows.map(r => {
                          const on = !bonEnvoiOff.has(r.key);
                          const edit = bonEnvoiEdits[r.key] || {};
                          const edited = edit.label != null || edit.qty != null;
                          return (
                            <tr key={r.key} className={on ? '' : 'opacity-45 line-through'}>
                              <td className="pl-4 pr-1 py-2">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleBonEnvoiKey(r.key)}
                                  className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer align-middle"
                                />
                              </td>
                              <td className="px-4 py-2 font-semibold text-slate-700 dark:text-dk-text-soft">
                                <input
                                  type="text"
                                  value={edit.label ?? r.color}
                                  onChange={e => editBonEnvoiRow(r.key, { label: e.target.value })}
                                  className="bg-transparent border-b border-dashed border-slate-300 dark:border-dk-border focus:border-indigo-500 outline-none px-0.5 min-w-0 w-28"
                                />
                              </td>
                              {beSizeCols.map(sz => {
                                const q = r.detail.filter(([s2]) => s2 === sz).reduce((a, [, v]) => a + v, 0);
                                return (
                                  <td key={sz} className={`px-2 py-2 text-center ${q ? 'font-semibold text-slate-700 dark:text-dk-text-soft' : 'text-slate-300 dark:text-dk-muted'}`}>
                                    {q || '—'}
                                  </td>
                                );
                              })}
                              <td className="px-4 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    value={edit.qty ?? r.total}
                                    onChange={e => editBonEnvoiRow(r.key, { qty: Math.max(0, parseInt(e.target.value) || 0) })}
                                    className="w-20 text-right bg-transparent border-b border-dashed border-slate-300 dark:border-dk-border focus:border-indigo-500 outline-none px-0.5 font-bold text-slate-700 dark:text-dk-text-soft"
                                  />
                                  <span className="text-slate-400 dark:text-dk-muted">pcs</span>
                                  {edited && (
                                    <button
                                      type="button"
                                      onClick={() => resetBonEnvoiRow(r.key)}
                                      title={tx(lang,{fr:'Revenir à la valeur de la commande',ar:'الرجوع لقيمة الطلبية',en:'Back to the order value',es:'Volver al valor del pedido',pt:'Voltar ao valor da encomenda',tr:'Sipariş değerine dön'})}
                                      className="text-[9px] font-bold text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent"
                                    >
                                      ↺
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-50 dark:bg-dk-bg/60">
                          <td colSpan={2} className="px-4 py-2 font-black uppercase tracking-wide text-[10px] text-slate-600 dark:text-dk-text-soft">
                            {tx(lang,{fr:'Total envoyé',ar:'مجموع المرسل',en:'Total sent',es:'Total enviado',pt:'Total enviado',tr:'Gönderilen toplam'})}
                          </td>
                          {beSizeCols.map(sz => {
                            // Total par taille des seules lignes cochées : c'est ce
                            // qu'on recomptera carton par carton à la réception.
                            const t = baseRows
                              .filter(r => !bonEnvoiOff.has(r.key))
                              .reduce((a, r) => a + r.detail.filter(([s2]) => s2 === sz).reduce((b, [, v]) => b + v, 0), 0);
                            return (
                              <td key={sz} className="px-2 py-2 text-center font-bold text-slate-600 dark:text-dk-text-soft">{t || '—'}</td>
                            );
                          })}
                          <td className="px-4 py-2 text-right font-extrabold text-indigo-600 dark:text-dk-accent">
                            {shippedTotal.toLocaleString(dateLocale)} pcs
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {shippedTotal !== order.totalQuantity && (
                    <p className="px-4 py-2 text-[10px] font-semibold text-amber-700 dark:text-amber-400 border-t border-slate-100 dark:border-dk-border">
                      {tx(lang,{
                        fr:`Envoi partiel : ${shippedTotal} pièces sur ${order.totalQuantity} enregistrées.`,
                        ar:`إرسال جزئي: ${shippedTotal} قطعة من أصل ${order.totalQuantity} مسجّلة.`,
                        en:`Partial shipment: ${shippedTotal} pieces out of ${order.totalQuantity} recorded.`,
                        es:`Envío parcial: ${shippedTotal} piezas de ${order.totalQuantity} registradas.`,
                        pt:`Remessa parcial: ${shippedTotal} peças de ${order.totalQuantity} registadas.`,
                        tr:`Kısmi sevkiyat: kayıtlı ${order.totalQuantity} adetten ${shippedTotal} adet.`,
                      })}
                    </p>
                  )}
                </div>

                {bonEnvoiShow.materials && (
                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                      {tx(lang,{fr:'Matières / fournitures à prévoir',ar:'المواد واللوازم الواجب توفيرها',en:'Materials / supplies to provide',es:'Materias / fornituras a prever',pt:'Matérias / acessórios a prever',tr:'Sağlanacak malzemeler'})}
                    </label>
                    <textarea
                      rows={3}
                      value={bonEnvoiMaterials}
                      onChange={e => setBonEnvoiMaterials(e.target.value)}
                      placeholder={tx(lang,{fr:'Une par ligne : fil noir 120, boutons 4 trous…',ar:'واحدة في كل سطر: خيط أسود 120، أزرار 4 ثقوب…',en:'One per line: black thread 120, 4-hole buttons…',es:'Una por línea: hilo negro 120, botones de 4 agujeros…',pt:'Uma por linha: linha preta 120, botões de 4 furos…',tr:'Her satıra bir tane: siyah iplik 120, 4 delikli düğme…'})}
                      className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                    />
                  </div>
                )}

                {bonEnvoiShow.notes && (
                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[10px]">
                      {tx(lang,{fr:'Notes du bon',ar:'ملاحظات المذكرة',en:'Delivery note remarks',es:'Notas del bono',pt:'Notas da nota',tr:'İrsaliye notları'})}
                    </label>
                    <textarea
                      rows={3}
                      value={bonEnvoiNotes}
                      onChange={e => setBonEnvoiNotes(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                    />
                    <p className="text-[10px] text-slate-400 dark:text-dk-muted italic">
                      {tx(lang,{fr:"Ces notes ne concernent que ce bon — la commande n'est pas modifiée.",ar:'هاد الملاحظات تخص هاد المذكرة فقط — الطلبية ما كتتبدلش.',en:'These remarks apply to this note only — the order is unchanged.',es:'Estas notas solo afectan a este bono — el pedido no se modifica.',pt:'Estas notas dizem respeito apenas a esta nota — a encomenda não é alterada.',tr:'Bu notlar yalnızca bu irsaliye içindir — sipariş değişmez.'})}
                    </p>
                  </div>
                )}

                {/* Identités imprimées — corrigibles avant remise du document. */}
                {([
                  { title: tx(lang,{fr:"Expéditeur (en-tête du bon)",ar:'المرسِل (رأس المذكرة)',en:'Sender (note header)',es:'Expedidor (encabezado)',pt:'Expedidor (cabeçalho)',tr:'Gönderen (irsaliye başlığı)'}), value: bonEnvoiIssuer, set: setBonEnvoiIssuer, isIssuer: true },
                  { title: tx(lang,{fr:'Destinataire (sous-traitant)',ar:'المرسَل إليه (المقاول من الباطن)',en:'Recipient (subcontractor)',es:'Destinatario (subcontratista)',pt:'Destinatário (subcontratado)',tr:'Alıcı (taşeron)'}), value: bonEnvoiTiers, set: setBonEnvoiTiers, isIssuer: false },
                ]).map(party => (
                  <div key={party.title} className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border flex items-center justify-between gap-2">
                      <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">{party.title}</h4>
                      {party.isIssuer && (
                        <button
                          type="button"
                          onClick={() => {
                            loadCompanyIdentity().then(id => {
                              if (!id) return;
                              // Rechargement EXPLICITE : ici on écrase, c'est ce
                              // qui est demandé par le clic.
                              setBonEnvoiIssuer({ nom: id.nom, ice: id.ice, rc: id.rc, adresse: id.adresse, tel: id.tel });
                            });
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-dk-accent-text hover:underline whitespace-nowrap"
                          title={tx(lang,{fr:'Recharger depuis Admin > Entreprise',ar:'إعادة التحميل من Admin > الشركة',en:'Reload from Admin > Company',es:'Recargar desde Admin > Empresa',pt:'Recarregar de Admin > Empresa',tr:"Admin > Şirket'ten yeniden yükle"})}
                        >
                          <Building2 className="w-3 h-3" />
                          <span>{tx(lang,{fr:'Depuis Admin',ar:'من Admin',en:'From Admin',es:'Desde Admin',pt:'De Admin',tr:'Adminden'})}</span>
                        </button>
                      )}
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {identityFields.map(f => (
                        <div key={f.k} className={f.k === 'adresse' ? 'sm:col-span-2' : ''}>
                          <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1">{f.label}</label>
                          <input
                            type="text"
                            value={party.value[f.k]}
                            onChange={e => party.set(prev => ({ ...prev, [f.k]: e.target.value }))}
                            className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-slate-50 dark:bg-dk-bg border-t border-slate-100 dark:border-dk-border px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 justify-end text-xs font-bold flex-wrap sticky bottom-0">
                <button
                  type="button"
                  onClick={() => setIsBonEnvoiModalOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated text-slate-500 dark:text-dk-muted rounded-xl font-bold transition-all"
                >
                  {tx(lang,{fr:'Fermer',ar:'إغلاق',en:'Close',es:'Cerrar',pt:'Fechar',tr:'Kapat'})}
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintDeliveryNote(order)}
                  className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent/90 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md dark:shadow-dk-md flex items-center gap-2 border border-indigo-600 dark:border-dk-accent"
                >
                  <Printer className="w-4 h-4" />
                  <span>{tx(lang,{fr:'Imprimer',ar:'طباعة',en:'Print',es:'Imprimir',pt:'Imprimir',tr:'Yazdır'})}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======================================= */}
      {/* SALE INVOICE MODAL (TAB 3 ACTION) */}
      {/* ======================================= */}
      {isSaleModalOpen && selectedModelForSale && (
        <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="relative my-auto bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-none sm:rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-none sm:max-w-4xl overflow-hidden flex flex-col h-[100dvh] sm:h-auto max-h-none sm:max-h-[90vh] text-slate-800 dark:text-dk-text">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-surface/55">
              <h2 className="font-bold text-slate-800 dark:text-dk-text text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600 dark:text-dk-accent" />
                <span>{tx(lang,{fr:'Générer une facture de sortie de stock (Vente)',ar:'إنشاء فاتورة إخراج من المخزون (بيع)',en:'Generate stock exit invoice (Sale)',es:'Generar factura de salida de stock (Venta)',pt:'Gerar fatura de saída de stock (Venda)',tr:'Stok çıkış faturası oluştur (Satış)'})}</span>
              </h2>
              <button onClick={() => setIsSaleModalOpen(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSaleInvoice} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700 dark:text-dk-text-soft">
              {/* Invoice structured details */}
              <div className="bg-slate-50 dark:bg-dk-surface/75 rounded-2xl p-4 border border-slate-200 dark:border-dk-border space-y-4">
                <h3 className="font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider text-[9px]">{tx(lang,{fr:'Informations Facture',ar:'معلومات الفاتورة',en:'Invoice Information',es:'Información de Factura',pt:'Informações da Fatura',tr:'Fatura Bilgileri'})}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'N° Facture',ar:'رقم الفاتورة',en:'Invoice N°',es:'N° Factura',pt:'N° Fatura',tr:'Fatura No'})}</label>
                    <input 
                      type="text"
                      value={saleInvoiceNumber}
                      onChange={(e) => setSaleInvoiceNumber(e.target.value)}
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text font-bold outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:ring-1 focus:ring-indigo-500 dark:focus:ring-dk-accent"
                      required
                    />
                  </div>
                  {/* Reprise d'un client enregistré : le nom, l'ICE, le RC, l'adresse
                      et le téléphone sont recopiés d'un coup. Sans cela, chaque vente
                      re-saisissait ces champs à la main — d'où des ICE oubliés et un
                      même client écrit de plusieurs façons d'une facture à l'autre.
                      Les champs restent modifiables : le registre propose, il n'impose pas. */}
                  {atelierClients.length > 0 && (
                    <div className="space-y-1 sm:col-span-2">
                      <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">
                        {tx(lang,{fr:'Client enregistré',ar:'زبون مسجَّل',en:'Registered client',es:'Cliente registrado',pt:'Cliente registado',tr:'Kayıtlı müşteri'})}
                      </label>
                      <select
                        value={atelierClients.find(c => c.nom === saleClient)?.id || ''}
                        onChange={(e) => {
                          const c = atelierClients.find(x => x.id === e.target.value);
                          if (!c) return;
                          setSaleClient(c.nom);
                          setSaleClientIce(c.ice || '');
                          setSaleClientRc(c.rc || '');
                          setSaleClientAdresse([c.adresse, c.ville].filter(Boolean).join(', '));
                          setSaleClientTel(c.tel || '');
                          setSaleClientEmail(c.email || '');
                        }}
                        className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                      >
                        <option value="">
                          {tx(lang,{fr:'— Saisie libre —',ar:'— إدخال حرّ —',en:'— Free entry —',es:'— Entrada libre —',pt:'— Entrada livre —',tr:'— Serbest giriş —'})}
                        </option>
                        {atelierClients.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.nom}
                            {c.type === 'GROS' ? ` · ${tx(lang,{fr:'Gros',ar:'الجملة',en:'Wholesale',es:'Mayorista',pt:'Grosso',tr:'Toptan'})}` : ''}
                            {c.type === 'BOUTIQUE' ? ` · ${tx(lang,{fr:'Boutique',ar:'محلّ',en:'Store',es:'Tienda',pt:'Loja',tr:'Mağaza'})}` : ''}
                            {c.ice ? ` · ICE ${c.ice}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Nom du client *',ar:'اسم العميل *',en:'Client Name *',es:'Nombre del Cliente *',pt:'Nome do Cliente *',tr:'Müşteri Adı *'})}</label>
                    <input 
                      type="text"
                      value={saleClient}
                      onChange={(e) => setSaleClient(e.target.value)}
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:ring-1 focus:ring-indigo-500 dark:focus:ring-dk-accent"
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
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:ring-1 focus:ring-indigo-500 dark:focus:ring-dk-accent"
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
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:ring-1 focus:ring-indigo-500 dark:focus:ring-dk-accent"
                      placeholder="RC"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Téléphone',ar:'الهاتف',en:'Phone',es:'Teléfono',pt:'Telefone',tr:'Telefon'})}</label>
                    <input 
                      type="text"
                      value={saleClientTel}
                      onChange={(e) => setSaleClientTel(e.target.value)}
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:ring-1 focus:ring-indigo-500 dark:focus:ring-dk-accent"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="block font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Adresse de livraison',ar:'عنوان التسليم',en:'Delivery address',es:'Dirección de entrega',pt:'Morada de entrega',tr:'Teslimat adresi'})}</label>
                    <input 
                      type="text"
                      value={saleClientAdresse}
                      onChange={(e) => setSaleClientAdresse(e.target.value)}
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:ring-1 focus:ring-indigo-500 dark:focus:ring-dk-accent"
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
                    <thead className="bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold">
                      <tr>
                        <th className="px-4 py-3">{tx(lang,{fr:'Désignation',ar:'البيان',en:'Description',es:'Designación',pt:'Designação',tr:'Açıklama'})}</th>
                        <th className="px-4 py-3 text-center w-28">{tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})}</th>
                        <th className="px-4 py-3 text-center w-36">{tx(lang,{fr:'Prix Unitaire (MAD)',ar:'السعر الوحدة (MAD)',en:'Unit Price (MAD)',es:'Precio Unitario (MAD)',pt:'Preço Unitário (MAD)',tr:'Birim Fiyat (MAD)'})}</th>
                        <th className="px-4 py-3 text-right w-40">{tx(lang,{fr:'Total HT',ar:'الإجمالي HT',en:'Total HT',es:'Total HT',pt:'Total HT',tr:'Toplam HT'})}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-dk-border text-slate-700 dark:text-dk-text-soft bg-white dark:bg-dk-surface">
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
                            className="w-full bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border rounded-lg p-2 text-center text-xs focus:border-indigo-500 dark:focus:border-dk-accent outline-none"
                            required
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input 
                            type="number"
                            value={salePrice || ''}
                            onChange={(e) => setSalePrice(Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text border border-slate-200 dark:border-dk-border rounded-lg p-2 text-center text-xs focus:border-indigo-500 dark:focus:border-dk-accent outline-none"
                            required
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-600 dark:text-dk-accent">
                          {(saleQuantity * (Number(salePrice) || 0)).toLocaleString()} MAD
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
                      className="w-full border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
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
                      className="w-full border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
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
                      className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 outline-none h-16 text-slate-800 dark:text-dk-text focus:border-indigo-500 dark:focus:border-dk-accent"
                    />
                  </div>
                </div>

                {/* Calculations preview box */}
                <div className="bg-slate-50 dark:bg-dk-surface/75 rounded-2xl p-5 border border-slate-200 dark:border-dk-border space-y-3 ml-auto w-full md:w-80">
                  <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-dk-border pb-2">{tx(lang,{fr:'Récapitulatif',ar:'الملخص',en:'Summary',es:'Resumen',pt:'Resumo',tr:'Özet'})}</h4>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'Montant HT',ar:'المبلغ HT',en:'HT Amount',es:'Importe HT',pt:'Valor HT',tr:'HT Tutarı'})}</span>
                    <span className="text-slate-800 dark:text-dk-text">{(saleQuantity * (Number(salePrice) || 0)).toLocaleString()} MAD</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'TVA',ar:'TVA',en:'VAT',es:'IVA',pt:'IVA',tr:'KDV'})} ({saleTvaRate}%)</span>
                    <span className="text-slate-800 dark:text-dk-text">{((saleQuantity * (Number(salePrice) || 0) * saleTvaRate) / 100).toLocaleString()} MAD</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-slate-200 dark:border-dk-border pt-2 text-indigo-600 dark:text-dk-accent">
                    <span>{tx(lang,{fr:'Total TTC',ar:'الإجمالي TTC',en:'Total TTC',es:'Total TTC',pt:'Total TTC',tr:'Toplam TTC'})}</span>
                    <span>{((saleQuantity * (Number(salePrice) || 0)) * (1 + saleTvaRate / 100)).toLocaleString()} MAD</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end border-t border-slate-200 dark:border-dk-border pt-4 mt-6">
                <button 
                  type="button" 
                  onClick={handlePrintSaleInvoice}
                  className="px-4 py-2 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated text-slate-700 dark:text-dk-text-soft rounded-xl font-bold flex items-center gap-2 shadow-sm dark:shadow-none transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>{tx(lang,{fr:'Imprimer la Facture',ar:'طباعة الفاتورة',en:'Print Invoice',es:'Imprimir Factura',pt:'Imprimir Fatura',tr:'Fatura Yazdır'})}</span>
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsSaleModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated text-slate-500 dark:text-dk-muted rounded-xl font-bold transition-all"
                >
                  {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md dark:shadow-dk-md flex items-center gap-2 border border-indigo-600 dark:border-dk-accent"
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

              <div className="flex gap-3 justify-between items-center border-t border-slate-200 dark:border-dk-border pt-4">
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

            {/* Rebonds : fiche de commande liée, et ouverture du modèle complet */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50 flex flex-wrap items-center justify-end gap-2">
              {(() => {
                const linkedOrder = orders.find(o => o.id === modelInfoOrderId) || null;
                if (!linkedOrder) return null;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setModelInfoTarget(null);
                      setDetailOrder(linkedOrder);
                      setIsDetailModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-indigo-600 dark:text-dk-accent-text hover:bg-indigo-50 dark:hover:bg-dk-accent/10 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{tx(lang,{fr:'Fiche de Commande Sous-traitance',ar:'بطاقة أمر المقاولة من الباطن',en:'Subcontract Order Sheet',es:'Ficha de Pedido de Subcontratación',pt:'Ficha de Encomenda de Subcontratação',tr:'Taşeron Sipariş Kartı'})}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                );
              })()}
              {onLoadModel && (
                <button
                  type="button"
                  onClick={() => { const m = modelInfoTarget; setModelInfoTarget(null); if (m) onLoadModel(m); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 text-white text-[11px] font-bold transition-colors"
                >
                  <span>{tx(lang,{fr:'Voir son modèle',ar:'عرض الموديل',en:'Open model',es:'Ver su modelo',pt:'Ver o modelo',tr:'Modeli aç'})}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
