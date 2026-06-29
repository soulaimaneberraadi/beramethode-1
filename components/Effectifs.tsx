import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Users, ChevronDown, UserCog, Factory, Plus, Trash2, Check, X, Settings2, LayoutGrid, Globe, EyeOff, Eye, ChevronLeft, ChevronRight, Calculator, TrendingUp, TrendingDown, Activity, CalendarDays, MessageSquare, Sparkles, FileDown } from 'lucide-react';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ResponsiveChart } from './ui/ResponsiveChart';
import { SuiviData, PlanningEvent, AppSettings } from '../types';
import DateTimePicker from './ui/DateTimePicker';
import { DEFAULT_CALENDAR_APP_SETTINGS } from '../lib/defaultCalendarSettings';
import {
  type EffectifsObservationAnchor,
  type EffectifsUserObservation,
  loadEffectifsUserObservations,
  persistEffectifsUserObservations,
  createEffectifsObservationId,
  defaultObservationTextForAnchor,
  observationAnchorTitle,
  observationAnchorSummary,
  observationNoteDisplayBody,
} from '../lib/effectifsObservations';

export type { EffectifsObservationAnchor, EffectifsUserObservation } from '../lib/effectifsObservations';

export interface EffectifsPageProps {
  onOpenGestionRH?: () => void;
  suivis?: SuiviData[];
  setSuivis?: React.Dispatch<React.SetStateAction<SuiviData[]>>;
  planningEvents?: PlanningEvent[];
  settings?: AppSettings;
  selectedChain?: string;
  setSelectedChain?: (chain: string) => void;
  selectedDate?: string;
  setSelectedDate?: (date: string) => void;
}

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'danger' | 'success' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  hideCancel?: boolean;
}

const ConfirmModal = ({ isOpen, title, message, type = 'danger', onConfirm, onCancel, confirmText: propConfirmText, cancelText: propCancelText, hideCancel = false }: ConfirmModalProps) => {
  const { lang } = useLang();
  const confirmText = propConfirmText || tx(lang, {fr:'Confirmer',ar:'تأكيد',en:'Confirm',es:'Confirmar',pt:'Confirmar',tr:'Onayla'});
  const cancelText = propCancelText || tx(lang, {fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'});
  if (!isOpen) return null;

  const getColors = () => {
    switch (type) {
      case 'danger': return { icon: 'text-red-500 bg-red-100', btn: 'bg-red-500 hover:bg-red-600' };
      case 'success': return { icon: 'text-emerald-500 bg-emerald-100', btn: 'bg-emerald-500 hover:bg-emerald-600' };
      default: return { icon: 'text-amber-500 bg-amber-100', btn: 'bg-amber-500 hover:bg-amber-600' };
    }
  };

  const colors = getColors();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-xl dark:shadow-dk-elevated w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full ${colors.icon} shrink-0`}>
              {type === 'success' ? <Check className="w-6 h-6" /> : type === 'danger' ? <Trash2 className="w-6 h-6" /> : <Settings2 className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-dk-text mb-2">{title}</h3>
              <p className="text-slate-600 dark:text-dk-text-soft text-sm leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-dk-bg px-6 py-4 flex justify-end gap-3 border-t border-slate-100 dark:border-dk-border">
          {!hideCancel && (
            <button onClick={onCancel} className="px-4 py-2 font-bold text-slate-600 dark:text-dk-text-soft bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
              {cancelText}
            </button>
          )}
          <button onClick={() => { onConfirm(); onCancel(); }} className={`px-4 py-2 font-bold text-white rounded-xl transition-colors ${colors.btn}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'danger' | 'success' | 'warning';
  onConfirm: () => void;
  hideCancel?: boolean;
}

type RoleCategory = 'Les chaines' | 'Responsables & Encadrement' | 'Finition' | "L'emballage" | string;
type DisplayBy = string;

const OBS_QUICK_LABELS_FR = [
  'Absentéisme élevé',
  'Pic d\'activité',
  'Effectif réduit',
  'Formation / intégration',
];

const EditableText = ({ value, onSave, className, textClassName, autoWidth, minWidth }: { value: string, onSave: (val: string) => void, className?: string, textClassName?: string, autoWidth?: boolean, minWidth?: number }) => {
  const [val, setVal] = useState(value);

  useEffect(() => { setVal(value); }, [value]);

  const computedStyle: React.CSSProperties = autoWidth
    ? { width: `${Math.max(val.length, 3) + 2}ch` }
    : minWidth
      ? { minWidth: `${minWidth}px`, width: `${Math.max(val.length * 10, minWidth)}px` }
      : undefined as any;

  return (
    <input
      type="text"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onSave(val)}
      onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      className={`bg-amber-50 dark:bg-amber-900/50 border border-amber-200 hover:border-amber-300 focus:bg-amber-50 focus:border-amber-400 rounded px-2 py-0.5 outline-none focus:ring-2 ring-amber-500/20 transition-all ${autoWidth || minWidth ? '' : 'w-full'} ${textClassName || className}`}
      style={computedStyle}
    />
  );
};

interface RoleDefinition {
  id: string;
  label: string;
  category: RoleCategory;
  isCustom?: boolean;
  isArchived?: boolean;
  isCalculated?: boolean;
}

interface PartitionItem {
  id: string;
  name: string;
}

interface CustomPartition {
  id: string;
  name: string;
  items: PartitionItem[];
}

interface CategoryConfig {
  displayBy: DisplayBy;
  isHidden?: boolean;
}

const DEFAULT_ROLES: RoleDefinition[] = [
  { id: 'recta', label: 'Machinistes', category: 'Les chaines' },
  { id: 'sujet', label: 'Surjeteuses', category: 'Les chaines' },
  { id: 'sp', label: 'Spéciales', category: 'Les chaines' },
  { id: 'man', label: 'Manutention', category: 'Les chaines' },
  { id: 'chaf', label: 'Chef de chaine', category: 'Responsables & Encadrement' },
  { id: 'methodes', label: 'Méthodes', category: 'Responsables & Encadrement' },
  { id: 'qualite', label: 'Responsable Qualité', category: 'Responsables & Encadrement' },
  { id: 'mecanicien', label: 'Mécanicien', category: 'Responsables & Encadrement' },
  { id: 'finition', label: 'Opérateurs (Finition)', category: 'Finition' },
  { id: 'controle', label: 'Contrôle (Finition)', category: 'Finition' },
  { id: 'transp', label: 'Plieurs / Emballeurs', category: "L'emballage" },
  { id: 'stager', label: 'Manutention (Emballage)', category: "L'emballage" }
];

const DEFAULT_CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  'Les chaines': { displayBy: 'CHAINES' },
  'Responsables & Encadrement': { displayBy: 'CHAINES' },
  'Finition': { displayBy: 'SALLES' },
  "L'emballage": { displayBy: 'SALLES' }
};

/** Identifiant de colonne grille Effectifs pour un item de partition (aligné avec handleUpdate). */
function effectifsPartitionColumnId(partitionId: string, itemId: string): string {
  return partitionId === 'SALLES' ? `salle_${itemId}` : `part_${partitionId}_${itemId}`;
}

/** Lignes créées depuis la grille Effectifs (standalone / sans planning) — exclut les suivis production qui réutiliseraient des chaineId du même préfixe. */
function isEffectifsGridPartitionSuivi(s: SuiviData): boolean {
  if (s.planningId === 'standalone') return true;
  if (s.planningId !== '') return false;
  const cid = s.chaineId || '';
  return cid.startsWith('salle_') || cid.startsWith('part_');
}

const MAX_HISTORICAL_PARTITION_COLS = 24;

function sumTotalWorkersForRoles(s: SuiviData, roleList: RoleDefinition[]): number {
  let total = 0;
  for (const r of roleList) {
    const val =
      DEFAULT_ROLES.some(dr => dr.id === r.id) || r.id in s
        ? (s as any)[r.id]
        : s.customEffectifs?.[r.id];
    total += Number(val) || 0;
  }
  return total;
}

type EffectifsGridColumn =
  | { id: string; label: string; type: 'chain'; isHistorical?: boolean }
  | { id: string; label: string; type: 'global'; isHistorical?: boolean }
  | { id: string; label: string; type: 'custom'; isHistorical?: boolean };

export default function Effectifs({ 
  onOpenGestionRH, suivis = [], setSuivis, planningEvents = [], settings,
  selectedChain: propSelectedChain,
  setSelectedChain: propSetSelectedChain,
  selectedDate: propSelectedDate,
  setSelectedDate: propSetSelectedDate
}: EffectifsPageProps) {
  const { lang } = useLang();
  const effectifsDtpSettings = settings ?? DEFAULT_CALENDAR_APP_SETTINGS;
  const [activeTab, setActiveTab] = useState<'grid' | 'analytics'>('grid');

  const [localChain, setLocalChain] = useState('Toutes les chaines');
  const selectedChain = propSelectedChain !== undefined ? propSelectedChain : localChain;
  const setSelectedChain = propSetSelectedChain !== undefined ? propSetSelectedChain : setLocalChain;

  const [localDate, setLocalDate] = useState(new Date().toISOString().split('T')[0]);
  const selectedDate = propSelectedDate !== undefined ? propSelectedDate : localDate;
  const setSelectedDate = propSetSelectedDate !== undefined ? propSetSelectedDate : setLocalDate;

  // Analytics Filters (chaîne = même filtre que l’en-tête `selectedChain`)
  const [analyticsFilterCategory, setAnalyticsFilterCategory] = useState<string>('Toutes');
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<'30' | '7'>('30');
  const [exportingPointage, setExportingPointage] = useState(false);

  const handleExportPointage = useCallback(async () => {
    const mois = selectedDate.slice(0, 7); // YYYY-MM
    const chaineParam = selectedChain !== 'Toutes les chaines' ? `&chaine=${encodeURIComponent(selectedChain)}` : '';
    setExportingPointage(true);
    try {
      const res = await fetch(`/api/worker-pointage/export?mois=${mois}${chaineParam}`, { credentials: 'include' });
      if (!res.ok) throw new Error(tx(lang,{fr:'Export échoué',ar:'فشل التصدير',en:'Export failed',es:'Exportación fallida',pt:'Exportação falhou',tr:'Dışa aktarma başarısız'}));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pointage_${mois}${selectedChain !== 'Toutes les chaines' ? `_${selectedChain}` : ''}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setExportingPointage(false);
    }
  }, [selectedDate, selectedChain]);
  
  // Custom roles state
  const [roles, setRoles] = useState<RoleDefinition[]>(() => {
    try {
      const saved = localStorage.getItem('BERA_CUSTOM_ROLES');
      return saved ? JSON.parse(saved) : DEFAULT_ROLES;
    } catch {
      return DEFAULT_ROLES;
    }
  });

  const [customPartitions, setCustomPartitions] = useState<CustomPartition[]>(() => {
    try {
      const saved = localStorage.getItem('BERA_CUSTOM_PARTITIONS');
      if (saved) return JSON.parse(saved);
      // Migration from old salles
      const savedSalles = localStorage.getItem('BERA_SALLES');
      if (savedSalles) {
        return [{ id: 'SALLES', name: tx(lang,{fr:'Par Salle',ar:'حسب القاعة',en:'By Room',es:'Por Sala',pt:'Por Sala',tr:'Odaya Göre'}), items: JSON.parse(savedSalles) }];
      }
      return [{ id: 'SALLES', name: tx(lang,{fr:'Par Salle',ar:'حسب القاعة',en:'By Room',es:'Por Sala',pt:'Por Sala',tr:'Odaya Göre'}), items: [{ id: 'salle_1', name: tx(lang,{fr:'Salle 1',ar:'قاعة 1',en:'Room 1',es:'Sala 1',pt:'Sala 1',tr:'Oda 1'}) }] }];
    } catch {
      return [{ id: 'SALLES', name: tx(lang,{fr:'Par Salle',ar:'حسب القاعة',en:'By Room',es:'Por Sala',pt:'Por Sala',tr:'Odaya Göre'}), items: [{ id: 'salle_1', name: tx(lang,{fr:'Salle 1',ar:'قاعة 1',en:'Room 1',es:'Sala 1',pt:'Sala 1',tr:'Oda 1'}) }] }];
    }
  });

  const [categoryConfigs, setCategoryConfigs] = useState<Record<string, CategoryConfig>>(() => {
    try {
      const saved = localStorage.getItem('BERA_CATEGORY_CONFIGS');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migration from string displayBy to CategoryConfig object
        const migrated: Record<string, CategoryConfig> = {};
        for (const key in parsed) {
          if (typeof parsed[key] === 'string') {
            migrated[key] = { displayBy: parsed[key] as DisplayBy, isHidden: false };
          } else {
            migrated[key] = parsed[key];
          }
        }
        return migrated;
      }
      return DEFAULT_CATEGORY_CONFIG;
    } catch { return DEFAULT_CATEGORY_CONFIG; }
  });

  useEffect(() => { localStorage.setItem('BERA_CUSTOM_ROLES', JSON.stringify(roles)); }, [roles]);
  useEffect(() => { localStorage.setItem('BERA_CUSTOM_PARTITIONS', JSON.stringify(customPartitions)); }, [customPartitions]);
  useEffect(() => { localStorage.setItem('BERA_CATEGORY_CONFIGS', JSON.stringify(categoryConfigs)); }, [categoryConfigs]);

  const analyticsFilterChain =
    selectedChain === 'Toutes les chaines' ? 'Toutes' : selectedChain;
  const setAnalyticsFilterChainFromChart = (f: string) => {
    setSelectedChain(f === 'Toutes' ? 'Toutes les chaines' : f);
  };

  const [isAddingRole, setIsAddingRole] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  /** Panneau Configurer / Nouveau Rôle — ouvert au clic sur Réglages ; reste ouvert si édition ou ajout actif. */
  const [gridRoleToolsOpen, setGridRoleToolsOpen] = useState(false);
  const [newRole, setNewRole] = useState({ label: '', category: 'Les chaines' });
  const [newCategory, setNewCategory] = useState('');
  const [newItemNames, setNewItemNames] = useState<Record<string, string>>({});
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({ isOpen: false, title: '', message: '', type: 'danger', onConfirm: () => {} });

  const [userObservationNotes, setUserObservationNotes] = useState<EffectifsUserObservation[]>(loadEffectifsUserObservations);

  const [obsCommentOpen, setObsCommentOpen] = useState(false);
  const [obsCommentText, setObsCommentText] = useState('');
  const [obsCommentAnchor, setObsCommentAnchor] = useState<EffectifsObservationAnchor | null>(null);

  useEffect(() => {
    persistEffectifsUserObservations(userObservationNotes);
  }, [userObservationNotes]);

  const openObservationComment = (anchor: EffectifsObservationAnchor) => {
    setObsCommentAnchor(anchor);
    setObsCommentText(defaultObservationTextForAnchor(anchor));
    setObsCommentOpen(true);
  };

  const saveObservationComment = () => {
    const t = obsCommentText.trim();
    if (!t || !obsCommentAnchor) return;
    const template = defaultObservationTextForAnchor(obsCommentAnchor).trim();
    if (t === template) return;
    const note: EffectifsUserObservation = {
      id: createEffectifsObservationId(),
      text: t,
      createdAt: Date.now(),
      anchor: obsCommentAnchor,
    };
    setUserObservationNotes(prev => [...prev, note]);
    setObsCommentOpen(false);
    setObsCommentAnchor(null);
    setObsCommentText('');
  };

  const deleteUserObservation = (id: string) => {
    setUserObservationNotes(prev => prev.filter(n => n.id !== id));
  };

  const requestConfirm = (title: string, message: string, onConfirm: () => void, type: 'danger'|'warning'|'success' = 'danger') => {
    setConfirmDialog({ isOpen: true, title, message, type, onConfirm });
  };

  const activeSuivisForDate = useMemo(() => {
    return suivis.filter(s => s.date === selectedDate);
  }, [suivis, selectedDate]);

  const allKnownChains = useMemo(() => {
    const chains = new Set<string>();
    planningEvents.forEach(p => {
      if (p.chaineId && p.chaineId !== 'global' && !p.chaineId.startsWith('salle_') && !p.chaineId.startsWith('part_')) {
        chains.add(p.chaineId);
      }
    });
    suivis.forEach(s => {
      if (s.chaineId && s.chaineId !== 'global' && !s.chaineId.startsWith('salle_') && !s.chaineId.startsWith('part_')) {
        chains.add(s.chaineId);
      }
    });
    const count = settings?.chainsCount || 4;
    for (let i = 1; i <= count; i++) {
      chains.add(`CHAINE ${i}`);
    }
    const result = Array.from(chains).sort();
    return result.length > 0 ? result : ['CHAINE 1'];
  }, [planningEvents, suivis, settings]);

  const displayChains = useMemo(() => {
    if (selectedChain === 'Toutes les chaines') return allKnownChains;
    return allKnownChains.includes(selectedChain) ? [selectedChain] : [];
  }, [allKnownChains, selectedChain]);

  const getChainLabel = (chainId: string) => {
    return settings?.chainNames?.[chainId] || chainId;
  };

  const getEffectifValue = (targetId: string, roleId: string, type: 'chain'|'global'|'custom') => {
    let s;
    if (type === 'chain') {
      s = activeSuivisForDate.find(s => {
        const plan = planningEvents.find(p => p.id === s.planningId);
        return (plan?.chaineId || s.chaineId) === targetId;
      });
    } else {
      s = activeSuivisForDate.find(s => s.chaineId === targetId);
    }
    
    if (!s) return 0;
    if (roleId in s) return (s as any)[roleId] || 0;
    return s.customEffectifs?.[roleId] || 0;
  };

  const handleUpdate = (targetId: string, roleId: string, value: number, type: 'chain'|'global'|'custom') => {
    if (!setSuivis) return;
    setSuivis(prev => {
      const existingIndex = prev.findIndex(s => {
        if (s.date !== selectedDate) return false;
        if (type === 'chain') {
          const plan = planningEvents.find(p => p.id === s.planningId);
          return (plan?.chaineId || s.chaineId) === targetId;
        }
        return s.chaineId === targetId;
      });

      let updatedArray = [...prev];
      let s: SuiviData;

      if (existingIndex >= 0) {
        s = { ...updatedArray[existingIndex] };
      } else {
        // For chain-type entries, link to the active planning event so SuiviProduction can read totalWorkers
        const activePlan = type === 'chain'
          ? planningEvents.find(p =>
              p.chaineId === targetId &&
              p.dateLancement <= selectedDate &&
              p.dateExport >= selectedDate
            )
          : undefined;
        s = {
          id: `effectif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          planningId: type === 'chain' ? (activePlan?.id || '') : 'standalone',
          chaineId: targetId,
          modelId: activePlan?.modelId,
          date: selectedDate,
          entrer: 0,
          sorties: {},
          totalHeure: 0,
          pJournaliere: 0,
          enCour: 0,
          resteEntrer: 0,
          resteSortie: 0,
          totalWorkers: 0,
          customEffectifs: {}
        };
      }

      const isBuiltIn = DEFAULT_ROLES.some(r => r.id === roleId);
      if (isBuiltIn || roleId in s) {
        (s as any)[roleId] = value;
      } else {
        s.customEffectifs = { ...s.customEffectifs, [roleId]: value };
      }

      // Seuls les rôles cochés (isCalculated !== false) comptent dans l'effectif
      // utilisé par Suivi et le calcul de rendement.
      const includedRoles = roles.filter(r => r.isCalculated !== false);
      s.totalWorkers = sumTotalWorkersForRoles(s, includedRoles);

      if (existingIndex >= 0) {
        updatedArray[existingIndex] = s;
      } else {
        updatedArray.push(s);
      }
      return updatedArray;
    });
  };

  const getColumnsForCategory = useCallback((category: string): EffectifsGridColumn[] => {
    const config = categoryConfigs[category] || { displayBy: 'CHAINES' };
    const catRoles = roles.filter(r => r.category === category);

    const suiviHasEffectifsForCategory = (s: SuiviData) =>
      catRoles.some(role => {
        const v =
          DEFAULT_ROLES.some(dr => dr.id === role.id) || role.id in s
            ? Number((s as any)[role.id]) || 0
            : Number(s.customEffectifs?.[role.id]) || 0;
        return v > 0;
      });

    if (config.displayBy === 'CHAINES') {
      return displayChains.map(c => ({ id: c, label: getChainLabel(c), type: 'chain' as const }));
    }
    if (config.displayBy === 'GLOBAL') {
      return [{ id: 'global', label: tx(lang,{fr:'Global',ar:'إجمالي',en:'Global',es:'Global',pt:'Global',tr:'Genel'}), type: 'global' as const }];
    }

    const partition = customPartitions.find(p => p.id === config.displayBy);
    if (partition) {
      const baseCols: EffectifsGridColumn[] = partition.items.map(item => ({
        id: effectifsPartitionColumnId(partition.id, item.id),
        label: item.name,
        type: 'custom',
      }));
      const known = new Set(baseCols.map(c => c.id));
      const prefix = partition.id === 'SALLES' ? 'salle_' : `part_${partition.id}_`;

      const orphans: EffectifsGridColumn[] = [];
      const seen = new Set<string>();
      for (const s of activeSuivisForDate) {
        if (!isEffectifsGridPartitionSuivi(s)) continue;
        const cid = s.chaineId || '';
        if (!cid.startsWith(prefix) || known.has(cid) || seen.has(cid)) continue;
        if (!suiviHasEffectifsForCategory(s)) continue;
        seen.add(cid);
        const shortLabel = cid.slice(prefix.length) || cid;
        orphans.push({
          id: cid,
          label: `${tx(lang, {fr:'Historique',ar:'سجل',en:'History',es:'Historial',pt:'Histórico',tr:'Geçmiş'})} · ${shortLabel}`,
          type: 'custom',
          isHistorical: true,
        });
      }
      orphans.sort((a, b) => a.id.localeCompare(b.id));
      const capped = orphans.slice(0, MAX_HISTORICAL_PARTITION_COLS);
      return [...baseCols, ...capped];
    }

    return displayChains.map(c => ({ id: c, label: getChainLabel(c), type: 'chain' as const }));
  }, [categoryConfigs, customPartitions, displayChains, activeSuivisForDate, roles, settings]);

  /** Active planning event per chain for selectedDate — used for color badges and planningId linkage. */
  const chainActivePlans = useMemo(() => {
    const map: Record<string, PlanningEvent | undefined> = {};
    allKnownChains.forEach(chainId => {
      map[chainId] = planningEvents.find(p =>
        p.chaineId === chainId &&
        p.dateLancement <= selectedDate &&
        p.dateExport >= selectedDate &&
        p.status !== 'DONE'
      );
    });
    return map;
  }, [allKnownChains, planningEvents, selectedDate]);

  const calculateTotalForRow = (roleId: string, category: string) => {
    const cols = getColumnsForCategory(category);
    return cols.reduce((sum, col) => sum + parseInt(getEffectifValue(col.id, roleId, col.type) as string || '0'), 0);
  };

  const calculateTotalForCol = (colId: string, colType: 'chain'|'global'|'custom', category: string) => {
    const catRoles = roles.filter(r => r.category === category);
    return catRoles.reduce((sum, role) => sum + parseInt(getEffectifValue(colId, role.id, colType) as string || '0'), 0);
  };

  const rolesByCategory = useMemo(() => {
    const grouped: Record<string, RoleDefinition[]> = {};
    roles.forEach(r => {
      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push(r);
    });
    return grouped;
  }, [roles]);

  const handleAddRole = () => {
    if (!newRole.label) return;
    const cat = newCategory.trim() || newRole.category;
    setRoles([...roles, {
      id: `custom_${Date.now()}`,
      label: newRole.label,
      category: cat,
      isCustom: true,
      isArchived: false
    }]);
    
    if (newCategory.trim() && !categoryConfigs[newCategory.trim()]) {
      setCategoryConfigs(prev => ({ ...prev, [newCategory.trim()]: { displayBy: 'CHAINES', isHidden: false } }));
    }

    setNewRole({ label: '', category: 'Les chaines' });
    setNewCategory('');
    setIsAddingRole(false);
  };

  const toggleArchiveRole = (id: string) => {
    setRoles(roles.map(r => r.id === id ? { ...r, isArchived: !r.isArchived } : r));
  };

  const handleRenameRole = (id: string, newLabel: string) => {
    setRoles(roles.map(r => r.id === id ? { ...r, label: newLabel } : r));
  };

  const handleDeleteRole = (id: string) => {
    requestConfirm(
      tx(lang,{fr:'Supprimer le rôle',ar:'حذف الدور',en:'Delete the role',es:'Eliminar el rol',pt:'Eliminar a função',tr:'Rolü sil'}),
      tx(lang,{fr:`Retirer ce rôle de la configuration et effacer ses effectifs pour la date affichée (${selectedDate}) uniquement ? Les autres dates conservent les valeurs enregistrées dans les suivis (auditable même si le rôle n'apparaît plus dans la grille).`,ar:`إزالة هذا الدور من التكوين ومسح موظفيه للتاريخ المعروض (${selectedDate}) فقط؟ التواريخ الأخرى تحتفظ بالقيم المسجلة في التتبعات (قابلة للتدقيق حتى لو لم يعد الدور يظهر في الجدول).`,en:`Remove this role from the configuration and clear its staff for the displayed date (${selectedDate}) only? Other dates keep the values recorded in the follow-ups (auditable even if the role no longer appears in the grid).`,es:`¿Retirar este rol de la configuración y borrar sus efectivos solo para la fecha mostrada (${selectedDate})? Las demás fechas conservan los valores registrados en los seguimientos (auditable aunque el rol ya no aparezca en la cuadrícula).`,pt:`Remover esta função da configuração e limpar os seus efetivos apenas para a data exibida (${selectedDate})? As outras datas mantêm os valores registados nos acompanhamentos (auditável mesmo que a função já não apareça na grelha).`,tr:`Bu rolü yapılandırmadan kaldır ve yalnızca görüntülenen tarih (${selectedDate}) için personelini temizle? Diğer tarihler, takiplerde kaydedilen değerleri korur (rol artık tabloda görünmese bile denetlenebilir).`}),
      () => {
        const rolesAfter = roles.filter(r => r.id !== id);
        if (setSuivis) {
          setSuivis(prev =>
            prev.map(s => {
              if (s.date !== selectedDate) return s;
              const next: SuiviData = { ...s };
              if (DEFAULT_ROLES.some(dr => dr.id === id)) {
                (next as any)[id] = 0;
              } else if (id in next) {
                delete (next as any)[id];
              }
              if (next.customEffectifs && Object.prototype.hasOwnProperty.call(next.customEffectifs, id)) {
                const ce = { ...next.customEffectifs };
                delete ce[id];
                next.customEffectifs = Object.keys(ce).length ? ce : {};
              }
              next.totalWorkers = sumTotalWorkersForRoles(next, rolesAfter);
              return next;
            })
          );
        }
        setRoles(rolesAfter);
      }
    );
  };

  const handleToggleCalculated = (id: string) => {
    const newRoles = roles.map(r => r.id === id ? { ...r, isCalculated: r.isCalculated === false ? true : false } : r);
    setRoles(newRoles);

    // Réactivité : recalculer totalWorkers (= somme des rôles cochés) pour les
    // entrées qui ont un détail par rôle, afin que Suivi/rendement se mettent à
    // jour immédiatement. On ne touche pas les entrées sans détail (legacy).
    if (setSuivis) {
      const includedRoles = newRoles.filter(r => r.isCalculated !== false);
      const getRoleVal = (s: SuiviData, r: RoleDefinition) =>
        DEFAULT_ROLES.some(dr => dr.id === r.id) || r.id in s ? (s as any)[r.id] : s.customEffectifs?.[r.id];
      setSuivis(prev => prev.map(s => {
        const hasBreakdown = newRoles.some(r => Number(getRoleVal(s, r)) > 0);
        if (!hasBreakdown) return s;
        return { ...s, totalWorkers: sumTotalWorkersForRoles(s, includedRoles) };
      }));
    }
  };

  const handleRenameCategory = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) return;
    setRoles(prev => prev.map(r => r.category === oldName ? { ...r, category: newName } : r));
    setCategoryConfigs(prev => {
      const newConfigs = { ...prev };
      if (newConfigs[oldName]) {
        newConfigs[newName] = { ...newConfigs[oldName] };
        delete newConfigs[oldName];
      }
      return newConfigs;
    });
  };

  const handleDeleteCategory = (category: string) => {
    requestConfirm(tx(lang,{fr:'Supprimer la catégorie',ar:'حذف الفئة',en:'Delete the category',es:'Eliminar la categoría',pt:'Eliminar a categoria',tr:'Kategoriyi sil'}), tx(lang,{fr:`Voulez-vous vraiment supprimer la catégorie "${category}" et TOUS les rôles qu'elle contient ? Cette action est irréversible.`,ar:`هل تريد بالتأكيد حذف الفئة "${category}" وجميع الأدوار التي تحتويها؟ هذا الإجراء لا رجعة فيه.`,en:`Are you sure you want to delete the category "${category}" and ALL the roles it contains? This action is irreversible.`,es:`¿Está seguro de eliminar la categoría "${category}" y TODOS los roles que contiene? Esta acción es irreversible.`,pt:`Tem a certeza que pretende eliminar a categoria "${category}" e TODAS as funções que contém? Esta ação é irreversível.`,tr:`"${category}" kategorisini ve içerdiği TÜM rolleri silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}), () => {
      setRoles(prev => prev.filter(r => r.category !== category));
      setCategoryConfigs(prev => {
        const newConfigs = { ...prev };
        delete newConfigs[category];
        return newConfigs;
      });
    });
  };

  const handleAddPartition = () => {
    const id = `part_${Date.now()}`;
    setCustomPartitions([...customPartitions, { id, name: tx(lang,{fr:'Nouvelle Répartition',ar:'تقسيم جديد',en:'New Partition',es:'Nueva Distribución',pt:'Nova Partição',tr:'Yeni Bölüm'}), items: [] }]);
  };

  const handleRenamePartition = (id: string, newName: string) => {
    if (!newName.trim()) return;
    setCustomPartitions(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
  };

  const handleDeletePartition = (id: string) => {
    requestConfirm(
      tx(lang,{fr:'Supprimer la répartition',ar:'حذف التقسيم',en:'Delete the partition',es:'Eliminar la distribución',pt:'Eliminar a partição',tr:'Bölümü sil'}),
      tx(lang,{fr:'Supprimer cette répartition ? Les lignes de suivi (effectifs) liées à ses colonnes pour la date affichée seront retirées ; les autres dates conservent l\u2019historique et réafficheront les colonnes « Historique » si des données existent.',ar:'حذف هذا التقسيم؟ سيتم إزالة خطوط التتبع (الموظفين) المرتبطة بأعمدته للتاريخ المعروض؛ التواريخ الأخرى تحتفظ بالسجل وتعرض أعمدة « سجل » إذا وجدت بيانات.',en:'Delete this partition? The tracking lines (staff) linked to its columns for the displayed date will be removed; other dates keep the history and will redisplay « History » columns if data exists.',es:'¿Eliminar esta distribución? Las líneas de seguimiento (efectivos) vinculadas a sus columnas para la fecha mostrada se eliminarán; las demás fechas conservan el historial y mostrarán las columnas « Historial » si existen datos.',pt:'Eliminar esta partição? As linhas de acompanhamento (efetivos) ligadas às suas colunas para a data exibida serão removidas; as outras datas mantêm o histórico e reexibirão as colunas « Histórico » se existirem dados.',tr:'Bu bölüm silinsin mi? Görüntülenen tarih için sütunlarına bağlı takip satırları (personel) kaldırılacak; diğer tarihler geçmişi korur ve veri varsa « Geçmiş » sütunlarını yeniden görüntüler.'}),
      () => {
        setCustomPartitions(prev => prev.filter(p => p.id !== id));
        setCategoryConfigs(prev => {
          const next = { ...prev };
          for (const cat in next) {
            if (next[cat].displayBy === id) {
              next[cat].displayBy = 'GLOBAL';
            }
          }
          return next;
        });
        if (setSuivis) {
          setSuivis(prev =>
            prev.filter(s => {
              if (s.date !== selectedDate) return true;
              const cid = s.chaineId || '';
              if (id === 'SALLES') return !cid.startsWith('salle_');
              return !cid.startsWith(`part_${id}_`);
            })
          );
        }
      }
    );
  };

  const handleAddPartitionItem = (partitionId: string) => {
    const name = newItemNames[partitionId];
    if (!name?.trim()) return;
    setCustomPartitions(prev => prev.map(p => {
      if (p.id === partitionId) {
        return { ...p, items: [...p.items, { id: `${Date.now()}`, name: name.trim() }] };
      }
      return p;
    }));
    setNewItemNames(prev => ({ ...prev, [partitionId]: '' }));
  };

  const handleRenamePartitionItem = (partitionId: string, itemId: string, newName: string) => {
    if (!newName.trim()) return;
    setCustomPartitions(prev => prev.map(p => {
      if (p.id === partitionId) {
        return { ...p, items: p.items.map(i => i.id === itemId ? { ...i, name: newName } : i) };
      }
      return p;
    }));
  };

  const handleDeletePartitionItem = (partitionId: string, itemId: string) => {
    const colId = effectifsPartitionColumnId(partitionId, itemId);
    requestConfirm(
      tx(lang,{fr:'Supprimer l\'élément',ar:'حذف العنصر',en:'Delete the item',es:'Eliminar el elemento',pt:'Eliminar o elemento',tr:'Öğeyi sil'}),
      tx(lang,{fr:`Supprimer cette colonne ? Les valeurs enregistrées pour la date du ${selectedDate} seront effacées. Les autres dates gardent leurs données ; en les ouvrant, la colonne réapparaîtra en « Historique » si des effectifs sont encore enregistrés.`,ar:`حذف هذا العمود؟ سيتم مسح القيم المسجلة لتاريخ ${selectedDate}. التواريخ الأخرى تحتفظ ببياناتها؛ عند فتحها، سيعاود العمود الظهور في « سجل » إذا كانت الموظفين لا تزال مسجلة.`,en:`Delete this column? The values recorded for date ${selectedDate} will be cleared. Other dates keep their data; when opened, the column will reappear in « History » if staff are still recorded.`,es:`¿Eliminar esta columna? Los valores registrados para la fecha ${selectedDate} se borrarán. Las demás fechas conservan sus datos; al abrirlas, la columna reaparecerá en « Historial » si aún hay efectivos registrados.`,pt:`Eliminar esta coluna? Os valores registados para a data ${selectedDate} serão apagados. As outras datas mantêm os seus dados; ao abri-las, a coluna reaparecerá em « Histórico » se ainda houver efetivos registados.`,tr:`Bu sütun silinsin mi? ${selectedDate} tarihi için kaydedilen değerler temizlenecek. Diğer tarihler verilerini korur; açıldığında, personel hâlâ kayıtlıysa sütun « Geçmiş » bölümünde yeniden görünecek.`}),
      () => {
        setCustomPartitions(prev =>
          prev.map(p => {
            if (p.id === partitionId) {
              return { ...p, items: p.items.filter(i => i.id !== itemId) };
            }
            return p;
          })
        );
        if (setSuivis) {
          setSuivis(prev => prev.filter(s => !(s.date === selectedDate && s.chaineId === colId)));
        }
      }
    );
  };

  const updateCategoryDisplayBy = (category: string, displayBy: DisplayBy) => {
    setCategoryConfigs(prev => ({ 
      ...prev, 
      [category]: { ...prev[category], displayBy } 
    }));
  };

  const toggleCategoryVisibility = (category: string) => {
    setCategoryConfigs(prev => ({ 
      ...prev, 
      [category]: { ...prev[category], isHidden: !prev[category]?.isHidden } 
    }));
  };

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const analyticsData = useMemo(() => {
    if (activeTab !== 'analytics') return null;

    const daysCount = analyticsTimeframe === '30' ? 30 : 7;
    const dates = [];
    const d = new Date(selectedDate);
    for(let i = daysCount - 1; i >= 0; i--) {
      const past = new Date(d);
      past.setDate(past.getDate() - i);
      dates.push(past.toISOString().split('T')[0]);
    }

    const dailyStats = dates.map(date => {
      const daySuivis = suivis.filter(s => s.date === date);
      let total = 0;
      let byChain: Record<string, number> = {};
      let byCategory: Record<string, number> = {};
      
      daySuivis.forEach(s => {
        const chainId = s.chaineId || 'global';
        if (analyticsFilterChain !== 'Toutes' && chainId !== analyticsFilterChain) return;

        let sTotal = 0;
        roles.forEach(r => {
          if (analyticsFilterCategory !== 'Toutes' && r.category !== analyticsFilterCategory) return;

          const val = Number((s as any)[r.id] || s.customEffectifs?.[r.id] || 0);
          if (val > 0) {
            sTotal += val;
            byCategory[r.category] = (byCategory[r.category] || 0) + val;
          }
        });
        total += sTotal;
        if (sTotal > 0) {
          byChain[chainId] = (byChain[chainId] || 0) + sTotal;
        }
      });

      return { 
        date, 
        total, 
        byChain, 
        byCategory,
        dayName: new Date(date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
      };
    });

    const maxTotal = Math.max(...dailyStats.map(s => s.total), 10);
    const today = dailyStats[dailyStats.length - 1] || { date: selectedDate, total: 0, byChain: {}, byCategory: {} };
    const yesterday = dailyStats[dailyStats.length - 2] || { total: 0 };

    const observations = [];
    
    if (today.total > yesterday.total) {
      const diff = today.total - yesterday.total;
      observations.push({ type: 'positive', text: tx(lang,{fr:`Hausse des effectifs: +${diff} employés par rapport à hier.`,ar:`ارتفاع عدد الموظفين: +${diff} موظفاً مقارنة بأمس.`,en:`Staff increase: +${diff} employees compared to yesterday.`,es:`Aumento de efectivos: +${diff} empleados respecto a ayer.`,pt:`Aumento de efetivos: +${diff} funcionários em relação a ontem.`,tr:`Personel artışı: düne göre +${diff} çalışan.`}), icon: <TrendingUp className="w-5 h-5 text-emerald-500"/> });
    } else if (today.total < yesterday.total) {
      const diff = yesterday.total - today.total;
      observations.push({ type: 'negative', text: tx(lang,{fr:`Baisse des effectifs: -${diff} employés aujourd'hui.`,ar:`انخفاض عدد الموظفين: -${diff} موظفاً اليوم.`,en:`Staff decrease: -${diff} employees today.`,es:`Disminución de efectivos: -${diff} empleados hoy.`,pt:`Queda de efetivos: -${diff} funcionários hoje.`,tr:`Personel azalışı: bugün -${diff} çalışan.`}), icon: <TrendingDown className="w-5 h-5 text-red-500"/> });
    } else {
      observations.push({ type: 'neutral', text: tx(lang,{fr:`Effectifs stables: Le même nombre d'employés qu'hier (${today.total}).`,ar:`الموظفون مستقرون: نفس عدد الموظفين مقارنة بأمس (${today.total}).`,en:`Staff stable: Same number of employees as yesterday (${today.total}).`,es:`Efectivos estables: Mismo número de empleados que ayer (${today.total}).`,pt:`Efetivos estáveis: Mesmo número de funcionários que ontem (${today.total}).`,tr:`Personel istikrarlı: Dünle aynı sayıda çalışan (${today.total}).`}), icon: <Activity className="w-5 h-5 text-blue-500"/> });
    }

    let maxCat = '';
    let maxCatVal = 0;
    Object.entries(today.byCategory).forEach(([cat, val]) => {
      if(val > maxCatVal) { maxCatVal = val; maxCat = cat; }
    });
    if (maxCat) {
      observations.push({ type: 'info', text: tx(lang,{fr:`La section "${maxCat}" regroupe la majorité du personnel avec ${maxCatVal} employés.`,ar:`قسم "${maxCat}" يضم غالبية الموظفين بعدد ${maxCatVal} موظفاً.`,en:`Section "${maxCat}" gathers the majority of staff with ${maxCatVal} employees.`,es:`La sección "${maxCat}" agrupa la mayoría del personal con ${maxCatVal} empleados.`,pt:`A secção "${maxCat}" reúne a maioria do pessoal com ${maxCatVal} funcionários.`,tr:`"${maxCat}" bölümü, ${maxCatVal} çalışanla personelin çoğunluğunu toplar.`}), icon: <Users className="w-5 h-5 text-indigo-500"/> });
    }

    let shortageChain = '';
    let minChainVal = 9999;
    Object.entries(today.byChain).forEach(([c, val]) => {
      if (val < minChainVal && val > 0 && c !== 'global' && !c.startsWith('salle_') && !c.startsWith('part_')) { 
        minChainVal = val; 
        shortageChain = c; 
      }
    });
    
    if (shortageChain && minChainVal < (today.total / Math.max(Object.keys(today.byChain).length, 1)) * 0.5) {
      observations.push({ type: 'warning', text: tx(lang,{fr:`Alerte: Effectif très faible sur ${getChainLabel(shortageChain)} (${minChainVal} personnes).`,ar:`تنبيه: عدد موظفين منخفض جداً على ${getChainLabel(shortageChain)} (${minChainVal} شخصاً).`,en:`Alert: Very low staff on ${getChainLabel(shortageChain)} (${minChainVal} people).`,es:`Alerta: Efectivo muy bajo en ${getChainLabel(shortageChain)} (${minChainVal} personas).`,pt:`Alerta: Efetivo muito baixo em ${getChainLabel(shortageChain)} (${minChainVal} pessoas).`,tr:`Uyarı: ${getChainLabel(shortageChain)} hattında çok düşük personel (${minChainVal} kişi).`}), icon: <Activity className="w-5 h-5 text-amber-500"/> });
    }

    return { dailyStats, maxTotal, today, yesterday, observations };
  }, [activeTab, selectedDate, suivis, roles, allKnownChains, settings, selectedChain, analyticsFilterCategory, analyticsTimeframe]);

  const userNotesForAnalyticsPanel = useMemo(() => {
    if (!analyticsData) return [];
    const range = new Set(analyticsData.dailyStats.map(d => d.date));
    return userObservationNotes
      .filter(n => {
        if (n.anchor.kind === 'chart_day') return range.has(n.anchor.date);
        if (n.anchor.kind === 'grid_column') return range.has(n.anchor.date);
        return false;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [analyticsData, userObservationNotes]);

  // Recharts Custom Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-dk-surface/95 backdrop-blur-md border border-slate-200 dark:border-dk-border shadow-xl dark:shadow-dk-elevated rounded-xl p-4">
          <p className="text-slate-500 dark:text-dk-muted font-bold mb-2 pb-2 border-b border-slate-100 dark:border-dk-border">{label}</p>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
            <span className="font-semibold text-slate-700 dark:text-dk-text-soft">{tx(lang,{fr:'Total:',ar:'المجموع:',en:'Total:',es:'Total:',pt:'Total:',tr:'Toplam:'})}</span>
             <span className="font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text text-lg">{payload[0].value} <span className="text-xs font-medium text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'employés',ar:'موظف',en:'employees',es:'empleados',pt:'funcionários',tr:'çalışan'})}</span></span>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderChartDot = (dotProps: any) => {
    const { cx, cy, payload } = dotProps;
    if (cx == null || cy == null || !payload?.date) return null;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="#fff"
        strokeWidth={2}
        stroke="#6366f1"
        className="recharts-dot cursor-context-menu outline-none"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openObservationComment({ kind: 'chart_day', date: payload.date });
        }}
      />
    );
  };

  const renderChartActiveDot = (dotProps: any) => {
    const { cx, cy, payload } = dotProps;
    if (cx == null || cy == null || !payload?.date) return null;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill="#6366f1"
        stroke="#fff"
        strokeWidth={2}
        className="recharts-active-dot cursor-context-menu outline-none"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openObservationComment({ kind: 'chart_day', date: payload.date });
        }}
      />
    );
  };

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto bg-gradient-to-b from-slate-50 via-[#fafafa] to-slate-100 dark:from-dk-bg dark:via-dk-bg dark:to-dk-bg">
      {obsCommentOpen && obsCommentAnchor && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-xl dark:shadow-dk-elevated w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-dk-border">
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-violet-100 text-violet-600 shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-dk-text">{tx(lang,{fr:'Observation personnalisée',ar:'ملاحظة مخصصة',en:'Custom observation',es:'Observación personalizada',pt:'Observação personalizada',tr:'Özel gözlem'})}</h3>
                  <p className="text-xs font-semibold text-violet-600 mt-1 truncate" title={observationAnchorTitle(obsCommentAnchor)}>
                    {observationAnchorTitle(obsCommentAnchor)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-dk-muted mt-2">
                    {tx(lang,{fr:"Cette note est liée à la date et à l’emplacement indiqués ci-dessus. Elle apparaît dans le panneau Observations (Analytique) lorsque la période affichée couvre ce jour.",ar:"هذه الملاحظة مرتبطة بالتاريخ والموقع المذكورين أعلاه. تظهر في لوحة الملاحظات (تحليلي) عندما تغطي الفترة المعروضة هذا اليوم.",en:"This note is linked to the date and location indicated above. It appears in the Observations panel (Analytics) when the displayed period covers this day.",es:"Esta nota está vinculada a la fecha y ubicación indicadas arriba. Aparece en el panel de Observaciones (Analítica) cuando el período mostrado cubre este día.",pt:"Esta nota está ligada à data e localização indicadas acima. Aparece no painel Observações (Analítica) quando o período exibido cobre este dia.",tr:"Bu not, yukarıda belirtilen tarih ve konuma bağlıdır. Görüntülenen dönem bu günü kapsadığında Gözlemler panelinde (Analitik) görünür."})}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {OBS_QUICK_LABELS_FR.map(label => {
                  const obsLabel = tx(lang, {
                    fr: label,
                    ar: label === 'Absentéisme élevé' ? 'غياب مرتفع' : label === "Pic d'activité" ? 'ذروة النشاط' : label === 'Effectif réduit' ? 'عدد موظفين محدود' : 'تدريب / إدماج',
                    en: label === 'Absentéisme élevé' ? 'High absenteeism' : label === "Pic d'activité" ? 'Activity peak' : label === 'Effectif réduit' ? 'Reduced staff' : 'Training / integration',
                    es: label === 'Absentéisme élevé' ? 'Absentismo alto' : label === "Pic d'activité" ? 'Pico de actividad' : label === 'Effectif réduit' ? 'Personal reducido' : 'Formación / integración',
                    pt: label === 'Absentéisme élevé' ? 'Absentismo elevado' : label === "Pic d'activité" ? 'Pico de atividade' : label === 'Effectif réduit' ? 'Efetivo reduzido' : 'Formação / integração',
                    tr: label === 'Absentéisme élevé' ? 'Yüksek devamsızlık' : label === "Pic d'activité" ? 'Aktivite zirvesi' : label === 'Effectif réduit' ? 'Azaltılmış personel' : 'Eğitim / entegrasyon',
                  });
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() =>
                        setObsCommentText(prev => {
                          const trimmed = prev.trim();
                          if (trimmed) return `${trimmed} · ${obsLabel}`;
                          return obsCommentAnchor
                            ? `${defaultObservationTextForAnchor(obsCommentAnchor).trimEnd()} · ${obsLabel}`
                            : obsLabel;
                        })
                      }
                      className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-dk-elevated text-slate-700 dark:text-dk-text-soft hover:bg-violet-100 hover:text-violet-800 transition-colors"
                    >
                      {obsLabel}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={obsCommentText}
                onChange={e => setObsCommentText(e.target.value)}
                rows={4}
                placeholder={tx(lang,{fr:'Complétez ou remplacez le texte proposé (obligatoire : ajouter du détail après les « : »).',ar:'أكمل أو استبدل النص المقترح (إجباري: أضف تفصيلاً بعد ":").',en:'Complete or replace the proposed text (mandatory: add detail after the ":").',es:'Complete o reemplace el texto propuesto (obligatorio: añadir detalle después de los ":").',pt:'Complete ou substitua o texto proposto (obrigatório: adicionar detalhe após os ":").',tr:'Önerilen metni tamamlayın veya değiştirin (zorunlu: ":"\'dan sonra detay ekleyin).'})}
                className="w-full rounded-xl border border-slate-200 dark:border-dk-border px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-dk-text placeholder:text-slate-400 focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 outline-none resize-y min-h-[100px]"
              />
            </div>
            <div className="bg-slate-50 dark:bg-dk-bg px-6 py-4 flex justify-end gap-3 border-t border-slate-100 dark:border-dk-border">
              <button
                type="button"
                onClick={() => { setObsCommentOpen(false); setObsCommentAnchor(null); setObsCommentText(''); }}
                className="px-4 py-2 font-bold text-slate-600 dark:text-dk-text-soft bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors"
              >
                {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
               </button>
               <button
                 type="button"
                 onClick={saveObservationComment}
                 disabled={
                   !obsCommentText.trim() ||
                   obsCommentText.trim() === defaultObservationTextForAnchor(obsCommentAnchor).trim()
                 }
                 className="px-4 py-2 font-bold text-white rounded-xl transition-colors bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:pointer-events-none"
               >
                 {tx(lang,{fr:'Enregistrer',ar:'حفظ',en:'Save',es:'Guardar',pt:'Guardar',tr:'Kaydet'})}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        hideCancel={confirmDialog.hideCancel}
        confirmText={confirmDialog.type === 'success' ? tx(lang,{fr:'OK',ar:'موافق',en:'OK',es:'OK',pt:'OK',tr:'Tamam'}) : tx(lang,{fr:'Confirmer',ar:'تأكيد',en:'Confirm',es:'Confirmar',pt:'Confirmar',tr:'Onayla'})}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
      <div className="w-full max-w-full mx-auto box-border px-2 py-1.5 sm:px-6 sm:py-6 flex flex-col gap-1.5 sm:gap-8 min-w-0">
        
        {/* HEADER & FILTERS — ultra-compact téléphone */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-1.5 sm:gap-4 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <div className="p-1.5 sm:p-3 bg-indigo-100 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text rounded-md sm:rounded-xl shadow-sm dark:shadow-dk-sm shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-2xl font-black text-slate-800 dark:text-dk-text tracking-tight leading-tight">{tx(lang,{fr:'Effectifs',ar:'الموظفون',en:'Staff',es:'Efectivos',pt:'Efetivos',tr:'Personel'})}</h1>
               <p className="hidden sm:block text-sm text-slate-500 dark:text-dk-muted font-medium leading-snug">
                 {tx(lang,{fr:'Répartition du personnel par chaîne, salle et date',ar:'توزيع الموظفين حسب خط الإنتاج والقاعة والتاريخ',en:'Staff distribution by chain, room and date',es:'Distribución del personal por cadena, sala y fecha',pt:'Distribuição do pessoal por linha, sala e data',tr:'Personel dağılımı hat, oda ve tarihe göre'})}
               </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap items-stretch sm:items-center gap-1 sm:gap-3 w-full min-w-0 lg:w-auto lg:justify-end lg:shrink">
            <div
              className="flex bg-slate-100 dark:bg-dk-elevated p-0.5 sm:p-1 rounded-md sm:rounded-xl shadow-inner w-full sm:w-auto shrink-0"
              role="tablist"
               aria-label={tx(lang,{fr:"Mode d'affichage Effectifs",ar:'وضع عرض الموظفين',en:'Staff display mode',es:'Modo de visualización de efectivos',pt:'Modo de visualização de efetivos',tr:'Personel görüntüleme modu'})}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'grid'}
                onClick={() => setActiveTab('grid')}
                className={`flex-1 sm:flex-none px-1.5 py-1 sm:px-6 sm:py-2.5 rounded sm:rounded-lg text-[10px] sm:text-sm font-bold flex items-center justify-center gap-0.5 sm:gap-2 transition-all duration-300 ${activeTab === 'grid' ? 'bg-white dark:bg-dk-surface text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text shadow-sm dark:shadow-dk-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
              >
                 <LayoutGrid className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" aria-hidden /> {tx(lang,{fr:'Saisie',ar:'إدخال',en:'Entry',es:'Ingreso',pt:'Entrada',tr:'Giriş'})}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'analytics'}
                onClick={() => setActiveTab('analytics')}
                className={`flex-1 sm:flex-none px-1.5 py-1 sm:px-6 sm:py-2.5 rounded sm:rounded-lg text-[10px] sm:text-sm font-bold flex items-center justify-center gap-0.5 sm:gap-2 transition-all duration-300 ${activeTab === 'analytics' ? 'bg-white dark:bg-dk-surface text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text shadow-sm dark:shadow-dk-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
              >
                 <Activity className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" aria-hidden /> {tx(lang,{fr:'Analytique',ar:'تحليلي',en:'Analytics',es:'Analítica',pt:'Analítica',tr:'Analitik'})}
              </button>
            </div>

            {onOpenGestionRH && (
              <button
                type="button"
                onClick={onOpenGestionRH}
                 aria-label={tx(lang,{fr:'Gestion RH détaillée',ar:'إدارة الموارد البشرية المفصلة',en:'Detailed HR management',es:'Gestión de RRHH detallada',pt:'Gestão de RH detalhada',tr:'Detaylı İK yönetimi'})}
                className="px-2 py-1 sm:px-4 sm:py-2 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 hover:bg-sky-100 font-bold rounded-md sm:rounded-xl flex items-center justify-center sm:justify-start gap-1 sm:gap-2 transition-colors shadow-sm dark:shadow-dk-sm text-[10px] sm:text-sm w-full sm:w-auto shrink-0"
              >
                <UserCog className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" aria-hidden />
                 <span className="sm:hidden">{tx(lang,{fr:'RH',ar:'الموارد البشرية',en:'HR',es:'RRHH',pt:'RH',tr:'İK'})}</span>
                 <span className="hidden sm:inline">{tx(lang,{fr:'Gestion RH Détaillée',ar:'إدارة الموارد البشرية المفصلة',en:'Detailed HR Management',es:'Gestión de RRHH Detallada',pt:'Gestão de RH Detalhada',tr:'Detaylı İK Yönetimi'})}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportPointage}
              disabled={exportingPointage}
               aria-label={tx(lang,{fr:'Exporter pointage mensuel Excel',ar:'تصدير كشف الحضور الشهري Excel',en:'Export monthly attendance Excel',es:'Exportar registro mensual Excel',pt:'Exportar ponto mensal Excel',tr:'Aylık puantajı Excel\'e aktar'})}
               title={tx(lang,{fr:`Exporter pointage ${selectedDate.slice(0, 7)}${selectedChain !== 'Toutes les chaines' ? ` — ${selectedChain}` : ''}`,ar:`تصدير كشف الحضور ${selectedDate.slice(0, 7)}${selectedChain !== 'Toutes les chaines' ? ` — ${selectedChain}` : ''}`,en:`Export attendance ${selectedDate.slice(0, 7)}${selectedChain !== 'Toutes les chaines' ? ` — ${selectedChain}` : ''}`,es:`Exportar registro ${selectedDate.slice(0, 7)}${selectedChain !== 'Toutes les chaines' ? ` — ${selectedChain}` : ''}`,pt:`Exportar ponto ${selectedDate.slice(0, 7)}${selectedChain !== 'Toutes les chaines' ? ` — ${selectedChain}` : ''}`,tr:`Puantajı dışa aktar ${selectedDate.slice(0, 7)}${selectedChain !== 'Toutes les chaines' ? ` — ${selectedChain}` : ''}`})}
              className="px-2 py-1 sm:px-4 sm:py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 font-bold rounded-md sm:rounded-xl flex items-center justify-center sm:justify-start gap-1 sm:gap-2 transition-colors shadow-sm dark:shadow-dk-sm text-[10px] sm:text-sm w-full sm:w-auto shrink-0"
            >
              <FileDown className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" aria-hidden />
              <span className="sm:hidden">{exportingPointage ? '…' : tx(lang,{fr:'Excel',ar:'Excel',en:'Excel',es:'Excel',pt:'Excel',tr:'Excel'})}</span>
               <span className="hidden sm:inline">{exportingPointage ? tx(lang,{fr:'Export…',ar:'تصدير…',en:'Export…',es:'Exportación…',pt:'Exportar…',tr:'Dışa aktar…'}) : tx(lang,{fr:'Export Mensuel',ar:'تصدير شهري',en:'Monthly Export',es:'Exportación Mensual',pt:'Exportação Mensal',tr:'Aylık Dışa Aktarım'})}</span>
            </button>

            <div className="relative w-full sm:w-auto sm:min-w-[11rem] sm:max-w-[min(100%,22rem)] min-w-0">
              <select
                value={selectedChain}
                onChange={(e) => setSelectedChain(e.target.value)}
                 aria-label={tx(lang,{fr:'Filtrer par chaîne',ar:'تصفية حسب خط الإنتاج',en:'Filter by chain',es:'Filtrar por cadena',pt:'Filtrar por linha',tr:'Hata göre filtrele'})}
                 title={selectedChain === 'Toutes les chaines' ? tx(lang,{fr:'Toutes les chaînes',ar:'جميع خطوط الإنتاج',en:'All chains',es:'Todas las cadenas',pt:'Todas as linhas',tr:'Tüm hatlar'}) : getChainLabel(selectedChain)}
                className="appearance-none min-h-[44px] w-full min-w-0 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface py-2 pl-3 pr-9 text-xs font-bold leading-snug text-slate-700 dark:text-dk-text-soft shadow-sm dark:shadow-dk-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 sm:min-h-0 sm:rounded-xl sm:py-2.5 sm:pl-4 sm:pr-9 sm:text-sm truncate"
              >
                 <option value="Toutes les chaines">{tx(lang,{fr:'Toutes',ar:'الكل',en:'All',es:'Todas',pt:'Todas',tr:'Tümü'})}</option>
                {allKnownChains.map(c => <option key={c} value={c}>{getChainLabel(c)}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-slate-400 dark:text-dk-muted sm:right-3 sm:h-4 sm:w-4" aria-hidden />
            </div>

            <div className="flex items-center bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md sm:rounded-xl shadow-sm dark:shadow-dk-sm overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-300 transition-all w-full sm:w-auto min-w-0 justify-stretch">
              <button 
                type="button"
                onClick={() => changeDate(-1)}
                className="p-1 sm:p-2.5 text-slate-400 hover:text-indigo-600 dark:text-dk-accent-text hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors border-r border-slate-100 dark:border-dk-border focus:outline-none shrink-0"
                 title={tx(lang,{fr:'Jour précédent',ar:'اليوم السابق',en:'Previous day',es:'Día anterior',pt:'Dia anterior',tr:'Önceki gün'})}
              >
                <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4 stroke-[2.5]" />
              </button>
              
              <div className="relative flex flex-1 min-w-0 items-center justify-center px-0.5 py-0.5 sm:px-1 sm:py-1">
                <DateTimePicker
                  value={selectedDate}
                  onChange={(iso) => setSelectedDate(iso.split('T')[0])}
                  mode="date"
                  settings={effectifsDtpSettings}
                  className="min-w-0 w-full [&_button]:justify-center"
                  inputClassName="min-h-[30px] w-full border-0 bg-transparent text-center text-[10px] font-bold text-slate-700 dark:text-dk-text-soft shadow-none outline-none focus:ring-2 focus:ring-indigo-500/25 sm:min-h-[36px] sm:text-sm py-1 px-1 rounded-md"
                />
              </div>

              <button 
                type="button"
                onClick={() => changeDate(1)}
                className="p-1 sm:p-2.5 text-slate-400 hover:text-indigo-600 dark:text-dk-accent-text hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors border-l border-slate-100 dark:border-dk-border focus:outline-none shrink-0"
                 title={tx(lang,{fr:'Jour suivant',ar:'اليوم التالي',en:'Next day',es:'Día siguiente',pt:'Próximo dia',tr:'Sonraki gün'})}
              >
                <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'grid' && (
          <>
            <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:justify-end sm:items-start w-full min-w-0">
              <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:max-w-[min(100%,28rem)] sm:shrink-0 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => setGridRoleToolsOpen(v => !v)}
                  aria-expanded={gridRoleToolsOpen || isEditMode || isAddingRole}
                  title={gridRoleToolsOpen || isEditMode || isAddingRole ? tx(lang,{fr:'Masquer les actions rôles / salles',ar:'إخفاء إجراءات الأدوار / القاعات',en:'Hide role/room actions',es:'Ocultar acciones de roles/salas',pt:'Ocultar ações de funções/salas',tr:'Rol/oda işlemlerini gizle'}) : tx(lang,{fr:'Afficher les actions rôles / salles',ar:'إظهار إجراءات الأدوار / القاعات',en:'Show role/room actions',es:'Mostrar acciones de roles/salas',pt:'Mostrar ações de funções/salas',tr:'Rol/oda işlemlerini göster'})}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg sm:rounded-xl border px-2.5 py-1.5 text-[11px] font-bold shadow-sm dark:shadow-dk-sm transition-colors sm:justify-center sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${
                    gridRoleToolsOpen || isEditMode || isAddingRole
                      ? 'border-indigo-200 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-800'
                      : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
                  }`}
                >
                  <span className="flex min-w-0 items-center justify-center gap-2">
                    <Settings2 className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate sm:hidden">{tx(lang,{fr:'Réglages rôles',ar:'إعدادات الأدوار',en:'Role settings',es:'Ajustes de roles',pt:'Configurações de funções',tr:'Rol ayarları'})}</span>
                     <span className="hidden truncate sm:inline">{tx(lang,{fr:'Réglages — Rôles & Salles',ar:'إعدادات — الأدوار والقاعات',en:'Settings — Roles & Rooms',es:'Ajustes — Roles y Salas',pt:'Configurações — Funções e Salas',tr:'Ayarlar — Roller ve Odalar'})}</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 dark:text-dk-muted transition-transform duration-200 ${gridRoleToolsOpen || isEditMode || isAddingRole ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>

                {(gridRoleToolsOpen || isEditMode || isAddingRole) && (
                  <div
                    className="flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/90 shadow-sm dark:shadow-dk-sm divide-y divide-slate-200 dark:divide-dk-border sm:flex-row sm:divide-x sm:divide-y-0"
                    role="group"
                    aria-label={tx(lang,{fr:'Configurer les rôles et créer un rôle',ar:'تكوين الأدوار وإنشاء دور',en:'Configure roles and create a role',es:'Configurar roles y crear un rol',pt:'Configurar funções e criar uma função',tr:'Rolleri yapılandır ve rol oluştur'})}
                  >
                    <button
                      type="button"
                      onClick={() => { setIsEditMode(!isEditMode); setIsAddingRole(false); }}
                      title={isEditMode ? tx(lang,{fr:'Terminer la configuration',ar:'إنهاء التكوين',en:'Finish configuration',es:'Finalizar configuración',pt:'Concluir configuração',tr:'Yapılandırmayı bitir'}) : tx(lang,{fr:'Configurer les Rôles / Salles',ar:'تكوين الأدوار / القاعات',en:'Configure Roles / Rooms',es:'Configurar Roles / Salas',pt:'Configurar Funções / Salas',tr:'Rolleri / Odaları Yapılandır'})}
                      className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-center text-xs font-bold leading-tight transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                        isEditMode ? 'bg-amber-100 text-amber-800' : 'bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
                      }`}
                    >
                      <Settings2 className="w-4 h-4 shrink-0" aria-hidden />
                      {isEditMode ? (
                        <>
                          <span className="sm:hidden">{tx(lang,{fr:'Terminer',ar:'إنهاء',en:'Finish',es:'Finalizar',pt:'Concluir',tr:'Bitir'})}</span>
                           <span className="hidden sm:inline">{tx(lang,{fr:'Terminer la configuration',ar:'إنهاء التكوين',en:'Finish configuration',es:'Finalizar configuración',pt:'Concluir configuração',tr:'Yapılandırmayı bitir'})}</span>
                        </>
                      ) : (
                        <>
                          <span className="sm:hidden">{tx(lang,{fr:'Configurer',ar:'تكوين',en:'Configure',es:'Configurar',pt:'Configurar',tr:'Yapılandır'})}</span>
                           <span className="hidden sm:inline">{tx(lang,{fr:'Configurer les Rôles / Salles',ar:'تكوين الأدوار / القاعات',en:'Configure Roles / Rooms',es:'Configurar Roles / Salas',pt:'Configurar Funções / Salas',tr:'Rolleri / Odaları Yapılandır'})}</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsAddingRole(!isAddingRole); setIsEditMode(false); }}
                      className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-center text-xs font-bold leading-tight transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                        isAddingRole ? 'bg-indigo-800 text-white' : 'bg-indigo-600 dark:bg-dk-accent text-white hover:bg-indigo-700 dark:hover:bg-dk-accent-hover'
                      }`}
                    >
                      {isAddingRole ? <X className="w-4 h-4 shrink-0" aria-hidden /> : <Plus className="w-4 h-4 shrink-0" aria-hidden />}
                      <span className="max-sm:whitespace-normal">{isAddingRole ? tx(lang,{fr:'Fermer',ar:'إغلاق',en:'Close',es:'Cerrar',pt:'Fechar',tr:'Kapat'}) : tx(lang,{fr:'Nouveau Rôle',ar:'دور جديد',en:'New Role',es:'Nuevo Rol',pt:'Nova Função',tr:'Yeni Rol'})}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

        {/* EDIT CONFIG PANEL */}
        {isEditMode && (
          <div className="bg-amber-50 dark:bg-amber-900/50 border border-amber-200 rounded-2xl p-5 shadow-sm dark:shadow-dk-sm mb-2 flex flex-col gap-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-amber-900 flex items-center gap-2"><LayoutGrid className="w-4 h-4"/> {tx(lang,{fr:'Gestion des Répartitions Personnalisées',ar:'إدارة التقسيمات المخصصة',en:'Custom Partitions Management',es:'Gestión de Distribuciones Personalizadas',pt:'Gestão de Partições Personalizadas',tr:'Özel Bölüm Yönetimi'})}</h3>
                <button onClick={handleAddPartition} className="text-xs font-bold bg-amber-200 text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-300 transition-colors flex items-center gap-1 shadow-sm dark:shadow-dk-sm">
                  <Plus className="w-3.5 h-3.5" /> {tx(lang,{fr:'Nouvelle Répartition',ar:'تقسيم جديد',en:'New Partition',es:'Nueva Distribución',pt:'Nova Partição',tr:'Yeni Bölüm'})}
                </button>
              </div>

              <div className="flex flex-col gap-4">
                {customPartitions.map(partition => (
                  <div key={partition.id} className="bg-white dark:bg-dk-surface p-4 rounded-xl border border-amber-200 shadow-sm dark:shadow-dk-sm flex flex-col gap-3">
                    <div className="flex items-center gap-2 pb-3 border-b border-amber-100">
                      <EditableText 
                        value={partition.name} 
                        onSave={(val) => handleRenamePartition(partition.id, val)}
                        textClassName="font-bold text-amber-900 text-base"
                        autoWidth
                      />
                      <button onClick={() => handleDeletePartition(partition.id)} className="text-amber-400 hover:text-red-500 transition-colors ml-auto p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 items-center">
                      {partition.items.map(item => (
                        <div key={item.id} className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 px-2 py-1.5 rounded-lg text-sm font-bold text-amber-800 flex items-center gap-1 group">
                          <EditableText 
                            value={item.name}
                            onSave={(val) => handleRenamePartitionItem(partition.id, item.id, val)}
                            textClassName="bg-transparent border-none p-0 focus:ring-0 text-amber-800"
                            autoWidth
                          />
                          <button onClick={() => handleDeletePartitionItem(partition.id, item.id)} className="text-amber-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 ml-1">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center gap-1 ml-1">
                        <input 
                          type="text" 
                          value={newItemNames[partition.id] || ''} 
                          onChange={e => setNewItemNames({...newItemNames, [partition.id]: e.target.value})}
                          placeholder={tx(lang,{fr:'Nouvel élément...',ar:'عنصر جديد...',en:'New item...',es:'Nuevo elemento...',pt:'Novo elemento...',tr:'Yeni öğe...'})}
                          className="px-3 py-1.5 rounded-lg border border-amber-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 w-36 bg-amber-50 dark:bg-amber-900/30 placeholder-amber-400/70 text-amber-900"
                          onKeyDown={e => e.key === 'Enter' && handleAddPartitionItem(partition.id)}
                        />
                        <button onClick={() => handleAddPartitionItem(partition.id)} disabled={!newItemNames[partition.id]?.trim()} className="p-1.5 bg-amber-200 text-amber-800 rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="text-sm text-amber-800 bg-amber-100/50 p-4 rounded-xl border border-amber-200/50">
              <p className="font-semibold mb-2 flex items-center gap-2"><UserCog className="w-4 h-4"/> {tx(lang,{fr:"Astuces d'historique (Masquage) :",ar:'نصائح السجل (الإخفاء):',en:'History tips (Hiding):',es:'Consejos de historial (Ocultación):',pt:'Dicas de histórico (Ocultação):',tr:'Geçmiş ipuçları (Gizleme):'})}</p>
              <ul className="list-disc list-inside space-y-1.5 opacity-90 ml-1">
                <li>{tx(lang,{fr:"Vous pouvez masquer un rôle ou une catégorie si vous n'en avez plus besoin.",ar:'يمكنك إخفاء دور أو فئة إذا لم تعد بحاجة إليها.',en:'You can hide a role or category if you no longer need it.',es:'Puede ocultar un rol o categoría si ya no lo necesita.',pt:'Pode ocultar uma função ou categoria se já não precisar dela.',tr:'Artık ihtiyacınız yoksa bir rolü veya kategoriyi gizleyebilirsiniz.'})}</li>
                <li>{tx(lang,{fr:"Si un rôle masqué a des données pour la date sélectionnée, il restera visible pour éviter de perdre l'historique !",ar:'إذا كان للدور المخفي بيانات للتاريخ المحدد، فسيظل مرئياً لتجنب فقدان السجل!',en:'If a hidden role has data for the selected date, it will remain visible to avoid losing history!',es:'Si un rol oculto tiene datos para la fecha seleccionada, permanecerá visible para no perder el historial.',pt:'Se uma função oculta tiver dados para a data selecionada, permanecerá visível para não perder o histórico!',tr:'Gizli bir rolün seçilen tarih için verisi varsa, geçmişi kaybetmemek için görünür kalacaktır!'})}</li>
                <li>{tx(lang,{fr:`Les colonnes « Historique » ne reprennent que les suivis saisis comme effectifs autonomes (sans ordre planning), pour éviter les totaux faux venant de la production ; affichage limité à ${MAX_HISTORICAL_PARTITION_COLS} colonnes.`,ar:`أعمدة «السجل» تسترجع فقط التتبعات المدخلة كموظفين مستقلين (بدون أمر تخطيط)، لتجنب المجاميع الخاطئة القادمة من الإنتاج؛ العرض محدود بـ ${MAX_HISTORICAL_PARTITION_COLS} عموداً.`,en:`"History" columns only recover entries entered as standalone staff (without planning order), to avoid false totals from production; display limited to ${MAX_HISTORICAL_PARTITION_COLS} columns.`,es:`Las columnas "Historial" solo recuperan los seguimientos ingresados como efectivos autónomos (sin orden de planificación), para evitar totales falsos de producción; visualización limitada a ${MAX_HISTORICAL_PARTITION_COLS} columnas.`,pt:`As colunas "Histórico" apenas recuperam os registos inseridos como efetivos autónomos (sem ordem de planeamento), para evitar totais falsos da produção; exibição limitada a ${MAX_HISTORICAL_PARTITION_COLS} colunas.`,tr:`"Geçmiş" sütunları, yalnızca bağımsız personel olarak girilen kayıtları (planlama emri olmadan) alır, üretimden gelen hatalı toplamları önlemek için; görüntüleme ${MAX_HISTORICAL_PARTITION_COLS} sütunla sınırlıdır.`})}</li>
              </ul>
            </div>
          </div>
        )}

        {isAddingRole && (
          <div className="px-5 py-4 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/50 border border-indigo-100 rounded-2xl flex flex-wrap items-end gap-4 shadow-sm dark:shadow-dk-sm mb-4">
            <div>
              <label className="block text-xs font-bold text-indigo-800 mb-1">{tx(lang,{fr:'Catégorie',ar:'الفئة',en:'Category',es:'Categoría',pt:'Categoria',tr:'Kategori'})}</label>
              <div className="flex gap-2">
                <select 
                  value={newRole.category}
                  onChange={e => { setNewRole({...newRole, category: e.target.value}); setNewCategory(''); }}
                  className="pl-3 pr-8 py-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-dk-surface"
                >
                  {Object.keys(rolesByCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  <option value="NEW">{tx(lang,{fr:'+ Nouvelle Catégorie',ar:'+ فئة جديدة',en:'+ New Category',es:'+ Nueva Categoría',pt:'+ Nova Categoria',tr:'+ Yeni Kategori'})}</option>
                </select>
                {newRole.category === 'NEW' && (
                  <input 
                    type="text" 
                    placeholder={tx(lang,{fr:'Nom de la catégorie',ar:'اسم الفئة',en:'Category name',es:'Nombre de la categoría',pt:'Nome da categoria',tr:'Kategori adı'})}
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="px-3 py-2 border border-indigo-200 rounded-lg text-sm w-48 focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-dk-surface"
                  />
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-indigo-800 mb-1">{tx(lang,{fr:'Nom du Rôle / Poste',ar:'اسم الدور / المنصب',en:'Role / Position Name',es:'Nombre del Rol / Puesto',pt:'Nome da Função / Cargo',tr:'Rol / Pozisyon Adı'})}</label>
              <input 
                type="text" 
                placeholder={tx(lang,{fr:'Ex: Machine Laser, Coupe...',ar:'مثال: ماكينة ليزر، قص...',en:'E.g.: Laser Machine, Cutting...',es:'Ej: Máquina Láser, Corte...',pt:'Ex: Máquina Laser, Corte...',tr:'Örn: Lazer Makinesi, Kesim...'})}
                value={newRole.label}
                onChange={e => setNewRole({...newRole, label: e.target.value})}
                className="px-3 py-2 border border-indigo-200 rounded-lg text-sm w-full max-w-xs sm:w-64 focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-dk-surface"
                onKeyDown={e => e.key === 'Enter' && handleAddRole()}
              />
            </div>
            <button 
              onClick={handleAddRole}
              disabled={!newRole.label || (newRole.category === 'NEW' && !newCategory)}
              className="px-4 py-2 bg-indigo-600 dark:bg-dk-accent text-white font-bold rounded-lg text-sm hover:bg-indigo-700 dark:hover:bg-dk-accent-hover disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> {tx(lang,{fr:'Ajouter',ar:'إضافة',en:'Add',es:'Añadir',pt:'Adicionar',tr:'Ekle'})}
            </button>
          </div>
        )}

        {/* TABLEAU VIEW */}
        {Object.entries(rolesByCategory).map(([category, catRoles]) => {
          const config = categoryConfigs[category] || { displayBy: 'CHAINES', isHidden: false };
          const cols = getColumnsForCategory(category);
          
          // Filter roles based on visibility rules
          const visibleRoles = catRoles.filter(row => {
            if (isEditMode) return true;
            const total = calculateTotalForRow(row.id, category);
            if (row.isArchived && total === 0) return false;
            return true;
          });

          // If category is hidden and NO visible roles have data today, hide it entirely in Normal mode
          const categoryHasDataToday = visibleRoles.some(r => calculateTotalForRow(r.id, category) > 0);
          if (!isEditMode && config.isHidden && !categoryHasDataToday) {
            return null;
          }

          if (visibleRoles.length === 0 && !isEditMode) return null;

          return (
            <div key={category} className={`bg-white dark:bg-dk-surface border ${config.isHidden ? 'border-slate-200 dark:border-dk-border/50 opacity-75' : 'border-slate-200 dark:border-dk-border'} shadow-sm dark:shadow-dk-sm rounded-2xl flex flex-col w-full`}>
              <div className="px-5 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50 flex flex-wrap gap-4 justify-between items-center">
                <div className="flex items-center gap-3 flex-shrink-0">
                  {isEditMode && (
                    <button 
                      onClick={() => toggleCategoryVisibility(category)}
                      className={`p-1.5 rounded-lg transition-colors ${config.isHidden ? 'bg-slate-200 text-slate-500 dark:text-dk-muted' : 'bg-indigo-100 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text hover:bg-indigo-200'}`}
                      title={config.isHidden ? tx(lang,{fr:'Afficher cette catégorie',ar:'إظهار هذه الفئة',en:'Show this category',es:'Mostrar esta categoría',pt:'Mostrar esta categoria',tr:'Bu kategoriyi göster'}) : tx(lang,{fr:'Masquer cette catégorie',ar:'إخفاء هذه الفئة',en:'Hide this category',es:'Ocultar esta categoría',pt:'Ocultar esta categoria',tr:'Bu kategoriyi gizle'})}
                    >
                      {config.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                  {isEditMode ? (
                    <div className="flex items-center gap-2">
                      <EditableText 
                        value={category} 
                        onSave={(newVal) => handleRenameCategory(category, newVal)} 
                        textClassName="text-lg font-bold text-slate-800 dark:text-dk-text"
                        minWidth={260}
                      />
                      {config.isHidden && <span className="text-xs font-normal text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'(Masquée)',ar:'(مخفي)',en:'(Hidden)',es:'(Oculto)',pt:'(Oculta)',tr:'(Gizli)'})}</span>}
                      <button 
                        onClick={() => handleDeleteCategory(category)}
                        className="p-1.5 ml-2 rounded-lg transition-colors bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 hover:text-red-600"
                        title={tx(lang,{fr:'Supprimer cette catégorie',ar:'حذف هذه الفئة',en:'Delete this category',es:'Eliminar esta categoría',pt:'Eliminar esta categoria',tr:'Bu kategoriyi sil'})}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <h2 className="text-lg font-bold text-slate-800 dark:text-dk-text">{category} {config.isHidden && <span className="text-xs font-normal text-slate-500 dark:text-dk-muted ml-2">{tx(lang,{fr:'(Masquée)',ar:'(مخفي)',en:'(Hidden)',es:'(Oculto)',pt:'(Oculta)',tr:'(Gizli)'})}</span>}</h2>
                  )}
                </div>
                {isEditMode && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Répartition:',ar:'التقسيم:',en:'Partition:',es:'Distribución:',pt:'Partição:',tr:'Bölüm:'})}</span>
                    <select 
                      value={config.displayBy}
                      onChange={e => updateCategoryDisplayBy(category, e.target.value)}
                      className="text-sm font-bold text-slate-700 dark:text-dk-text-soft bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-500 outline-none max-w-[160px]"
                    >
                      <option value="CHAINES">{tx(lang,{fr:'Par Chaine',ar:'حسب خط الإنتاج',en:'By Chain',es:'Por Cadena',pt:'Por Linha',tr:'Hata Göre'})}</option>
                       <option value="GLOBAL">{tx(lang,{fr:'Globale',ar:'إجمالي',en:'Global',es:'Global',pt:'Global',tr:'Genel'})}</option>
                       {customPartitions.length > 0 && (
                         <optgroup label={tx(lang,{fr:'Personnalisées',ar:'مخصصة',en:'Custom',es:'Personalizadas',pt:'Personalizadas',tr:'Özel'})}>
                          {customPartitions.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                )}
              </div>

              {(!config.isHidden || isEditMode || categoryHasDataToday) && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border">
                      <th className="px-2 py-2 text-xs font-semibold text-slate-600 dark:text-dk-text-soft whitespace-normal leading-snug sm:px-4 sm:py-3 sm:text-sm sticky left-0 z-10 bg-slate-50 dark:bg-dk-bg shadow-[1px_0_0_0_#e2e8f0] min-w-[6.75rem] w-[28vw] max-w-[10rem] sm:min-w-[11rem] sm:w-44 sm:max-w-none md:min-w-[14rem] md:w-56 lg:w-64 lg:min-w-[16rem]">
                        {tx(lang,{fr:'Rôle / ',ar:'الدور / ',en:'Role / ',es:'Rol / ',pt:'Função / ',tr:'Rol / '})}{config.displayBy === 'CHAINES' ? tx(lang,{fr:'Chaine',ar:'خط الإنتاج',en:'Chain',es:'Cadena',pt:'Linha',tr:'Hat'}) : config.displayBy === 'GLOBAL' ? tx(lang,{fr:'Global',ar:'إجمالي',en:'Global',es:'Global',pt:'Global',tr:'Genel'}) : customPartitions.find(p => p.id === config.displayBy)?.name || tx(lang,{fr:'Partition',ar:'تقسيم',en:'Partition',es:'Distribución',pt:'Partição',tr:'Bölüm'})}
                      </th>
                      {cols.map(c => {
                        const colNotesCount = userObservationNotes.filter(
                          n =>
                            n.anchor.kind === 'grid_column' &&
                            n.anchor.date === selectedDate &&
                            n.anchor.category === category &&
                            n.anchor.colId === c.id
                        ).length;
                        return (
                        <th
                          key={c.id}
                          title={
                             colNotesCount > 0
                               ? tx(lang,{fr:`Clic droit : ajouter une observation · ${colNotesCount} note(s) pour cette colonne et cette date`,ar:`نقر يمين: إضافة ملاحظة · ${colNotesCount} ملاحظة لهذا العمود وهذا التاريخ`,en:`Right-click: add an observation · ${colNotesCount} note(s) for this column and this date`,es:`Clic derecho: añadir observación · ${colNotesCount} nota(s) para esta columna y esta fecha`,pt:`Clique direito: adicionar observação · ${colNotesCount} nota(s) para esta coluna e esta data`,tr:`Sağ tık: gözlem ekle · bu sütun ve bu tarih için ${colNotesCount} not`})
                               : tx(lang,{fr:'Clic droit : ajouter une observation',ar:'نقر يمين: إضافة ملاحظة',en:'Right-click: add an observation',es:'Clic derecho: añadir observación',pt:'Clique direito: adicionar observação',tr:'Sağ tık: gözlem ekle'})
                           }
                          onContextMenu={(e) => {
                            e.preventDefault();
                            openObservationComment({
                              kind: 'grid_column',
                              date: selectedDate,
                              category,
                              colId: c.id,
                              colLabel: c.label,
                            });
                          }}
                          className={`relative px-2 py-2 sm:px-4 sm:py-3 font-bold text-center text-xs sm:text-sm min-w-[4.5rem] sm:min-w-[6rem] cursor-context-menu ${
                            c.type === 'custom' && c.isHistorical
                              ? 'bg-amber-50 dark:bg-amber-900/95 text-amber-950 border-l border-amber-200/80'
                              : 'text-slate-800 dark:text-dk-text'
                          }`}
                        >
                          {colNotesCount > 0 && (
                            <span
                              className="absolute top-1.5 right-1.5 min-w-[1.125rem] h-[1.125rem] px-1 flex items-center justify-center rounded-full bg-violet-600 text-white text-[10px] font-black leading-none shadow-sm dark:shadow-dk-sm z-20"
                              aria-hidden
                            >
                              {colNotesCount > 9 ? '9+' : colNotesCount}
                            </span>
                          )}
                          <div className="flex flex-col items-center gap-0.5">
                            <span>{c.label}</span>
                            {c.type === 'chain' && chainActivePlans[c.id] && (() => {
                              const plan = chainActivePlans[c.id]!;
                              const color = plan.color || '#6366f1';
                              const name = plan.modelName || plan.modelId || 'OF';
                              return (
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full truncate max-w-[7rem] leading-tight"
                                  style={{ backgroundColor: color + '22', color, border: `1px solid ${color}55` }}
                                  title={name}
                                >
                                  {name}
                                </span>
                              );
                            })()}
                            <span className="text-xs font-medium text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 px-2 py-0.5 rounded-full">
                              {calculateTotalForCol(c.id, c.type, category)}
                            </span>
                          </div>
                        </th>
                      );
                      })}
                      <th className="px-2 py-2 sm:px-4 sm:py-3 font-bold text-slate-800 dark:text-dk-text text-center text-xs sm:text-sm bg-slate-100/50 min-w-[3.25rem] sm:min-w-[5rem]">{tx(lang,{fr:'Total',ar:'المجموع',en:'Total',es:'Total',pt:'Total',tr:'Toplam'})}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRoles.map(row => {
                      const totalRow = calculateTotalForRow(row.id, category);
                      return (
                      <tr key={row.id} className={`hover:bg-slate-50/50 transition-colors group ${row.isArchived ? 'opacity-60 bg-slate-50 dark:bg-dk-bg' : ''}`}>
                        <td className={`px-2 py-2 sm:px-4 sm:py-3 font-medium text-slate-700 dark:text-dk-text-soft bg-white dark:bg-dk-surface group-hover:bg-slate-50/50 sticky left-0 shadow-[1px_0_0_0_#e2e8f0] z-10 flex flex-wrap items-center justify-between gap-x-1 gap-y-1 min-w-[6.75rem] w-[28vw] max-w-[10rem] sm:min-w-[11rem] sm:w-44 sm:max-w-none md:min-w-[12rem] md:w-auto md:max-w-none lg:min-w-[200px] ${row.isArchived ? 'bg-slate-50 dark:bg-dk-bg' : ''}`}>
                          <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
                            {isEditMode ? (
                              <EditableText 
                                value={row.label} 
                                onSave={(newVal) => handleRenameRole(row.id, newVal)} 
                                textClassName={`text-sm font-bold ${row.isArchived ? 'text-slate-500 dark:text-dk-muted line-through' : 'text-slate-800 dark:text-dk-text'}`}
                              />
                            ) : (
                              <span className={`break-words ${row.isArchived ? 'line-through decoration-slate-400' : ''}`}>{row.label}</span>
                            )}
                          </div>
                          
                          {isEditMode && (
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => handleToggleCalculated(row.id)}
                                className={`p-1.5 rounded-lg transition-colors ${row.isCalculated !== false ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 hover:bg-emerald-200' : 'text-slate-400 dark:text-dk-muted bg-slate-100 dark:bg-dk-elevated hover:bg-slate-200'}`}
                                title={row.isCalculated !== false ? tx(lang,{fr:'Inclus dans le calcul de rendement',ar:'مشمول في حساب الإنتاجية',en:'Included in yield calculation',es:'Incluido en el cálculo de rendimiento',pt:'Incluído no cálculo de rendimento',tr:'Verim hesaplamasına dahil'}) : tx(lang,{fr:'Exclu du calcul de rendement',ar:'مستبعد من حساب الإنتاجية',en:'Excluded from yield calculation',es:'Excluido del cálculo de rendimiento',pt:'Excluído do cálculo de rendimento',tr:'Verim hesaplamasından hariç'})}
                              >
                                <Calculator className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => toggleArchiveRole(row.id)}
                                className={`p-1.5 rounded-lg transition-colors ${row.isArchived ? 'bg-slate-200 text-slate-500 dark:text-dk-muted' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100'}`}
                                title={row.isArchived ? tx(lang,{fr:'Restaurer ce rôle',ar:'استعادة هذا الدور',en:'Restore this role',es:'Restaurar este rol',pt:'Restaurar esta função',tr:'Bu rolü geri yükle'}) : tx(lang,{fr:'Masquer ce rôle',ar:'إخفاء هذا الدور',en:'Hide this role',es:'Ocultar este rol',pt:'Ocultar esta função',tr:'Bu rolü gizle'})}
                              >
                                {row.isArchived ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                              <button 
                                onClick={() => handleDeleteRole(row.id)}
                                className="p-1.5 rounded-lg transition-colors bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 hover:text-red-600"
                                title={tx(lang,{fr:'Supprimer définitivement',ar:'حذف نهائي',en:'Delete permanently',es:'Eliminar permanentemente',pt:'Eliminar permanentemente',tr:'Kalıcı olarak sil'})}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                        {cols.map(c => {
                          const val = getEffectifValue(c.id, row.id, c.type);
                          return (
                            <td
                              key={`${row.id}-${c.id}`}
                              className={`px-2 py-2 text-center ${c.type === 'custom' && c.isHistorical ? 'bg-amber-50 dark:bg-amber-900/50' : ''}`}
                            >
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={val === 0 ? '' : val}
                                onKeyDown={(e) => {
                                  if (['.', ',', '-', 'e', 'E', '+'].includes(e.key)) {
                                    e.preventDefault();
                                  }
                                }}
                                onChange={(e) => {
                                  const rawVal = e.target.value.replace(/[^0-9]/g, '');
                                  const num = parseInt(rawVal, 10);
                                  handleUpdate(c.id, row.id, isNaN(num) ? 0 : num, c.type);
                                }}
                                className={`w-16 text-center font-bold border-b-2 bg-transparent transition-colors focus:outline-none ${row.isArchived ? 'text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border focus:border-slate-400' : 'text-indigo-700 dark:text-dk-accent-text border-slate-200 dark:border-dk-border hover:border-indigo-300 focus:border-indigo-500'}`}
                                placeholder="0"
                              />
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text bg-slate-100/50">
                          {totalRow}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          );
        })}
        </>
        )}

        {activeTab === 'analytics' && analyticsData && (
          <div className="flex flex-col gap-2 sm:gap-6 animate-in fade-in duration-300">
            {/* KPI Cards — chiffres réduits sur téléphone */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-4">
              <div className="bg-white dark:bg-dk-surface rounded-lg sm:rounded-2xl p-2 sm:p-5 shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border flex flex-col gap-0.5 sm:gap-2">
                <div className="text-[10px] sm:text-sm font-bold text-slate-500 dark:text-dk-muted flex items-center gap-1 sm:gap-2"><Users className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" /> {tx(lang,{fr:"Effectif Total Aujourd'hui",ar:'إجمالي الموظفين اليوم',en:"Total Staff Today",es:'Efectivo Total Hoy',pt:'Efetivo Total Hoje',tr:"Bugünkü Toplam Personel"})}</div>
                <div className="text-lg sm:text-3xl font-black text-slate-800 dark:text-dk-text leading-none tabular-nums">{analyticsData.today.total}</div>
                <div className={`text-[10px] sm:text-sm font-semibold flex items-center gap-0.5 sm:gap-1 ${analyticsData.today.total >= analyticsData.yesterday.total ? 'text-emerald-500' : 'text-red-500'}`}>
                  {analyticsData.today.total >= analyticsData.yesterday.total ? <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" /> : <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />}
                  {Math.abs(analyticsData.today.total - analyticsData.yesterday.total)} {tx(lang,{fr:'vs hier',ar:'مقارنة بأمس',en:'vs yesterday',es:'vs ayer',pt:'vs ontem',tr:'düne göre'})}
                </div>
              </div>
              <div className="bg-white dark:bg-dk-surface rounded-lg sm:rounded-2xl p-2 sm:p-5 shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border flex flex-col gap-0.5 sm:gap-2 min-w-0">
                <div className="text-[10px] sm:text-sm font-bold text-slate-500 dark:text-dk-muted flex items-center gap-1 sm:gap-2"><Factory className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" /> {tx(lang,{fr:'Chaine la plus peuplée',ar:'خط الإنتاج الأكثر كثافة',en:'Most staffed chain',es:'Cadena más poblada',pt:'Linha mais populosa',tr:'En kalabalık hat'})}</div>
                {(() => {
                  let max = 0; let name = '-';
                  Object.entries(analyticsData.today.byChain).forEach(([c, v]) => {
                    if (v > max && c !== 'global' && !c.startsWith('salle_') && !c.startsWith('part_')) { max = v; name = getChainLabel(c); }
                  });
                  return (
                    <>
                      <div className="text-lg sm:text-3xl font-black text-slate-800 dark:text-dk-text leading-none truncate" title={name}>{name}</div>
                      <div className="text-[10px] sm:text-sm font-semibold text-indigo-500">{max} {tx(lang,{fr:'employés',ar:'موظف',en:'employees',es:'empleados',pt:'funcionários',tr:'çalışan'})}</div>
                    </>
                  );
                })()}
              </div>
              <div className="bg-white dark:bg-dk-surface rounded-lg sm:rounded-2xl p-2 sm:p-5 shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border flex flex-col gap-0.5 sm:gap-2">
                <div className="text-[10px] sm:text-sm font-bold text-slate-500 dark:text-dk-muted flex items-center gap-1 sm:gap-2"><CalendarDays className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" /> {tx(lang,{fr:'Moyenne 30 jours',ar:'متوسط 30 يوماً',en:'30-day average',es:'Promedio 30 días',pt:'Média 30 dias',tr:'30 günlük ortalama'})}</div>
                {(() => {
                  const avg = Math.round(analyticsData.dailyStats.reduce((sum, d) => sum + d.total, 0) / 30);
                  return (
                    <>
                      <div className="text-lg sm:text-3xl font-black text-slate-800 dark:text-dk-text leading-none tabular-nums">{avg}</div>
                      <div className="text-[10px] sm:text-sm font-semibold text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'Employés par jour',ar:'موظفين في اليوم',en:'Employees per day',es:'Empleados por día',pt:'Funcionários por dia',tr:'Günlük çalışan'})}</div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Main Chart & Observations */}
            <div className="grid grid-cols-1 gap-2 sm:gap-6 lg:grid-cols-3 lg:items-start">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-lg sm:rounded-2xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-sm dark:shadow-dk-sm lg:col-span-2">
                <div className="p-2 sm:p-5 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <h3 className="text-sm sm:text-lg font-bold text-slate-800 dark:text-dk-text flex items-center gap-2 min-w-0 shrink-0">
                    <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500 shrink-0" />
                    <span className="min-w-0 leading-tight">{tx(lang,{fr:'Évolution des Effectifs',ar:'تطور الموظفين',en:'Staff Evolution',es:'Evolución de Efectivos',pt:'Evolução dos Efetivos',tr:'Personel Gelişimi'})}</span>
                  </h3>
                  
                  {/* Chart Filters — colonne pleine largeur sur téléphone (lisible + zone tactile), ligne sur sm+ */}
                  <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-[min(100%,28rem)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
                    <select
                      value={analyticsTimeframe}
                      onChange={(e) => setAnalyticsTimeframe(e.target.value as '30' | '7')}
                      aria-label={tx(lang,{fr:'Période du graphique',ar:'فترة الرسم البياني',en:'Chart period',es:'Período del gráfico',pt:'Período do gráfico',tr:'Grafik dönemi'})}
                      className="min-h-[44px] w-full shrink-0 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2 text-xs font-bold text-slate-700 dark:text-dk-text-soft shadow-sm dark:shadow-dk-sm outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0 sm:w-auto sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-xs"
                    >
                      <option value="30">{tx(lang,{fr:'30 Jours',ar:'30 يوماً',en:'30 Days',es:'30 Días',pt:'30 Dias',tr:'30 Gün'})}</option>
                       <option value="7">{tx(lang,{fr:'7 Jours',ar:'7 أيام',en:'7 Days',es:'7 Días',pt:'7 Dias',tr:'7 Gün'})}</option>
                    </select>
                    
                    <select
                      value={analyticsFilterChain}
                      onChange={(e) => setAnalyticsFilterChainFromChart(e.target.value)}
                      aria-label={tx(lang,{fr:'Chaîne pour le graphique',ar:'خط الإنتاج للرسم البياني',en:'Chain for chart',es:'Cadena para el gráfico',pt:'Linha para o gráfico',tr:'Grafik için hat'})}
                      className="min-h-[44px] w-full shrink-0 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2 text-xs font-bold text-slate-700 dark:text-dk-text-soft shadow-sm dark:shadow-dk-sm outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0 sm:w-auto sm:min-w-[8rem] sm:max-w-[120px] sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-xs"
                    >
                      <option value="Toutes">{tx(lang,{fr:'Toutes les chaines',ar:'جميع السلاسل',en:'All chains',es:'Todas las cadenas',pt:'Todas as linhas',tr:'Tüm hatlar'})}</option>
                      {allKnownChains.map(c => <option key={c} value={c}>{getChainLabel(c)}</option>)}
                    </select>

                    <select
                      value={analyticsFilterCategory}
                      onChange={(e) => setAnalyticsFilterCategory(e.target.value)}
                      aria-label={tx(lang,{fr:'Catégorie pour le graphique',ar:'الفئة للرسم البياني',en:'Category for chart',es:'Categoría para el gráfico',pt:'Categoria para o gráfico',tr:'Grafik için kategori'})}
                      className="min-h-[44px] w-full shrink-0 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2 text-xs font-bold text-slate-700 dark:text-dk-text-soft shadow-sm dark:shadow-dk-sm outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0 sm:w-auto sm:min-w-[8rem] sm:max-w-[140px] sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-xs"
                    >
                      <option value="Toutes">{tx(lang,{fr:'Toutes les catégories',ar:'جميع الفئات',en:'All categories',es:'Todas las categorías',pt:'Todas as categorias',tr:'Tüm kategoriler'})}</option>
                      {Object.keys(rolesByCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                </div>
                
                <div className="relative flex min-h-0 flex-1 flex-col p-2 sm:p-6">
                  {analyticsData.dailyStats.every(s => s.total === 0) ? (
                    <div className="flex flex-1 items-center justify-center text-slate-400 dark:text-dk-muted font-medium italic text-xs sm:text-base">
                       {tx(lang,{fr:'Aucune donnée pour les critères sélectionnés.',ar:'لا توجد بيانات للمعايير المحددة.',en:'No data for the selected criteria.',es:'No hay datos para los criterios seleccionados.',pt:'Sem dados para os critérios selecionados.',tr:'Seçilen kriterler için veri yok.'})}
                     </div>
                  ) : (
                    <div className="h-[160px] w-full shrink-0 sm:h-[320px]">
                      <ResponsiveChart>
                        <ComposedChart data={analyticsData.dailyStats} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="date" 
                            tickFormatter={(tick) => new Date(tick).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                            tick={{ fontSize: 10, fill: '#64748b' }} 
                            axisLine={false} 
                            tickLine={false}
                            minTickGap={20}
                          />
                          <YAxis 
                            stroke="#64748b" 
                            tick={{ fontSize: 10 }} 
                            axisLine={false} 
                            tickLine={false} 
                          />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc', stroke: '#e2e8f0', strokeWidth: 1, strokeDasharray: '3 3' }} />
                          <Area 
                            type="monotone" 
                            isAnimationActive={false}
                            dataKey="total" 
                            stroke="none" 
                            fill="url(#colorTotal)" 
                          />
                          <Line 
                            type="monotone" 
                            isAnimationActive={false}
                            dataKey="total" 
                            stroke="#6366f1" 
                            strokeWidth={3} 
                            dot={renderChartDot}
                            activeDot={renderChartActiveDot}
                          />
                        </ComposedChart>
                      </ResponsiveChart>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="relative flex max-h-[min(70vh,40rem)] w-full min-h-0 flex-col self-start overflow-hidden rounded-xl sm:rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-white via-violet-50/35 to-indigo-50/40 shadow-[0_12px_40px_-16px_rgba(99,102,241,0.35)] ring-1 ring-white/60 lg:max-h-[calc(100dvh-9.5rem)]">
                <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-indigo-400/[0.12] blur-3xl" />
                <div className="pointer-events-none absolute -bottom-8 -left-8 h-36 w-36 rounded-full bg-fuchsia-400/[0.10] blur-3xl" />
                <div className="relative flex min-h-0 flex-1 flex-col p-2.5 sm:p-6">
                  <div className="shrink-0">
                  <div className="mb-2 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-indigo-600 dark:bg-dk-accent/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-indigo-700 dark:text-dk-accent-text ring-1 ring-indigo-500/15 sm:mb-2 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.14em]">
                        <Sparkles className="h-2.5 w-2.5 shrink-0 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text sm:h-3 sm:w-3" aria-hidden />
                        {tx(lang,{fr:'Veille & notes',ar:'مراقبة وملاحظات',en:'Monitoring & notes',es:'Vigilancia y notas',pt:'Vigilância e notas',tr:'İzleme ve notlar'})}
                      </span>
                      <h3 className="flex items-center gap-2 text-base font-black tracking-tight text-slate-900 dark:text-dk-text sm:gap-3 sm:text-xl">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg dark:shadow-dk-lg shadow-indigo-500/35 ring-2 ring-white/50 sm:h-11 sm:w-11 sm:rounded-2xl">
                          <Eye className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.25} />
                        </span>
                        {tx(lang,{fr:'Observations',ar:'ملاحظات',en:'Observations',es:'Observaciones',pt:'Observações',tr:'Gözlemler'})}
                      </h3>
                    </div>
                  </div>

                  <div className="mb-3 rounded-lg border border-indigo-100/90 bg-white dark:bg-dk-surface/75 px-2.5 py-2 text-[10px] font-medium leading-snug text-slate-600 dark:text-dk-text-soft shadow-inner shadow-indigo-500/[0.04] backdrop-blur-sm sm:mb-5 sm:rounded-xl sm:px-4 sm:py-3 sm:text-xs sm:leading-relaxed">
                    <span className="font-bold text-indigo-800">{tx(lang,{fr:'Astuce :',ar:'نصيحة:',en:'Tip:',es:'Consejo:',pt:'Dica:',tr:'İpucu:'})}</span>{' '}
                    {tx(lang,{fr:`clic droit sur une colonne en « Saisie », ou sur un point du graphique, pour ancrer une note. Elle s'affiche ici pour la période couverte.`,ar:`انقر يميناً على عمود في «إدخال»، أو على نقطة في الرسم البياني، لإرفاق ملاحظة. تظهر هنا للفترة المشمولة.`,en:`right-click on a column in "Entry", or on a chart point, to attach a note. It appears here for the covered period.`,es:`clic derecho en una columna de "Ingreso", o en un punto del gráfico, para anclar una nota. Se muestra aquí para el período cubierto.`,pt:`clique direito numa coluna em "Entrada", ou num ponto do gráfico, para anexar uma nota. Aparece aqui para o período abrangido.`,tr:`"Giriş"teki bir sütuna veya grafikteki bir noktaya sağ tıklayarak not ekleyin. Kapsanan dönem için burada görünür.`})} s’affiche ici pour la période couverte.
                  </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch]">
                  <div className="flex flex-col gap-5 pb-1">
                    {analyticsData.observations.length > 0 && (
                      <div>
                        <p className="mb-2.5 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted">
                          <span className="h-px flex-1 max-w-[2rem] rounded-full bg-gradient-to-r from-transparent to-slate-300" />
                          {tx(lang,{fr:'Détections automatiques',ar:'الكشف التلقائي',en:'Automatic detections',es:'Detecciones automáticas',pt:'Detecções automáticas',tr:'Otomatik tespitler'})}
                          <span className="h-px flex-1 rounded-full bg-gradient-to-l from-transparent to-slate-300" />
                        </p>
                        <div className="flex flex-col gap-2.5">
                          {analyticsData.observations.map((obs, i) => {
                            const accent =
                              obs.type === 'positive'
                                ? 'border-l-emerald-500 from-emerald-50/90 to-white'
                                : obs.type === 'negative'
                                  ? 'border-l-red-500 from-red-50/90 to-white'
                                  : obs.type === 'warning'
                                    ? 'border-l-amber-500 from-amber-50/90 to-white'
                                    : 'border-l-sky-500 from-sky-50/80 to-white';
                            const text =
                              obs.type === 'positive'
                                ? 'text-emerald-900'
                                : obs.type === 'negative'
                                  ? 'text-red-900'
                                  : obs.type === 'warning'
                                    ? 'text-amber-950'
                                    : 'text-sky-950';
                            return (
                              <div
                                key={`auto-${i}`}
                                className={`group relative overflow-hidden rounded-xl border border-slate-200 dark:border-dk-border/80 border-l-[3px] bg-gradient-to-r ${accent} p-3.5 pl-4 shadow-sm dark:shadow-dk-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-dk-surface/90 shadow-sm dark:shadow-dk-sm ring-1 ring-slate-200/60 transition-transform group-hover:scale-[1.03]">
                                    {obs.icon}
                                  </div>
                                  <p className={`min-w-0 flex-1 line-clamp-5 text-sm font-semibold leading-snug ${text}`} title={obs.text}>{obs.text}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {userNotesForAnalyticsPanel.length > 0 && (
                      <div>
                        <p className="mb-2.5 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-violet-500/90">
                          <span className="h-px flex-1 max-w-[2rem] rounded-full bg-gradient-to-r from-transparent to-violet-300" />
                          {tx(lang,{fr:'Vos annotations',ar:'تعليقاتك',en:'Your annotations',es:'Sus anotaciones',pt:'As suas anotações',tr:'Notlarınız'})}
                          <span className="h-px flex-1 rounded-full bg-gradient-to-l from-transparent to-violet-300" />
                        </p>
                        <div className="flex flex-col gap-2.5">
                          {userNotesForAnalyticsPanel.map(note => (
                            <div
                              key={note.id}
                              className="group relative overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/40 p-4 shadow-md dark:shadow-dk-md shadow-violet-500/10 ring-1 ring-white/80 transition-all duration-200 hover:-translate-y-px hover:shadow-lg hover:shadow-violet-500/15"
                            >
                              <div className="pointer-events-none absolute right-0 top-0 h-16 w-16 translate-x-6 -translate-y-6 rounded-full bg-violet-400/10" />
                              <div className="relative flex items-start gap-3">
                                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md dark:shadow-dk-md shadow-violet-500/30">
                                  <MessageSquare className="h-5 w-5" strokeWidth={2} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className="mb-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700/90"
                                    title={`${observationAnchorTitle(note.anchor)} — ${observationNoteDisplayBody(note.text, note.anchor)}`}
                                  >
                                    <span className="shrink-0 rounded-md bg-violet-200/70 px-1.5 py-0.5 font-black text-violet-900">
                                      {note.anchor.kind === 'chart_day' ? tx(lang,{fr:'Courbe',ar:'منحنى',en:'Chart',es:'Curva',pt:'Curva',tr:'Grafik'}) : tx(lang,{fr:'Colonne',ar:'عمود',en:'Column',es:'Columna',pt:'Coluna',tr:'Sütun'})}
                                    </span>
                                    <span className="min-w-0 truncate font-semibold normal-case tracking-normal text-violet-800">
                                      {observationAnchorSummary(note.anchor)}
                                    </span>
                                  </p>
                                  <p
                                    className="line-clamp-6 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-violet-950"
                                    title={note.text}
                                  >
                                    {observationNoteDisplayBody(note.text, note.anchor)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => deleteUserObservation(note.id)}
                                  className="shrink-0 rounded-xl p-2 text-violet-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                  title={tx(lang,{fr:'Supprimer cette observation',ar:'حذف هذه الملاحظة',en:'Delete this observation',es:'Eliminar esta observación',pt:'Eliminar esta observação',tr:'Bu gözlemi sil'})}
                                  aria-label={tx(lang,{fr:'Supprimer cette observation',ar:'حذف هذه الملاحظة',en:'Delete this observation',es:'Eliminar esta observación',pt:'Eliminar esta observação',tr:'Bu gözlemi sil'})}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {analyticsData.observations.length === 0 && userNotesForAnalyticsPanel.length === 0 && (
                      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface/50 py-10 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-dk-elevated text-slate-400 dark:text-dk-muted ring-4 ring-slate-50">
                          <MessageSquare className="h-7 w-7" strokeWidth={1.5} />
                        </div>
                        <p className="max-w-[240px] text-sm font-medium text-slate-500 dark:text-dk-muted">
                          {tx(lang,{fr:'Aucune observation pour cette période. Ajoutez une note depuis la saisie ou le graphique.',ar:'لا توجد ملاحظات لهذه الفترة. أضف ملاحظة من الإدخال أو الرسم البياني.',en:'No observations for this period. Add a note from the entry or the chart.',es:'No hay observaciones para este periodo. Añada una nota desde el ingreso o el gráfico.',pt:'Sem observações para este período. Adicione uma nota a partir da entrada ou do gráfico.',tr:'Bu dönem için gözlem yok. Giriş veya grafikt ek bir not ekleyin.'})}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                </div>
              </div>
            </div>

            {/* Detailed Analytics Table */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800 dark:text-dk-text flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-slate-500 dark:text-dk-muted" /> {tx(lang,{fr:'Répartition par Chaîne & Catégorie',ar:'التوزيع حسب خط الإنتاج والفئة',en:'Distribution by Chain & Category',es:'Distribución por Cadena y Categoría',pt:'Distribuição por Linha e Categoria',tr:'Hat ve Kategoriye Göre Dağılım'})}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white dark:bg-dk-surface">
                    <tr className="border-b border-slate-100 dark:border-dk-border">
                      <th className="px-6 py-3 font-semibold text-slate-500 dark:text-dk-muted">{tx(lang,{fr:"Aujourd'hui",ar:'اليوم',en:'Today',es:'Hoy',pt:'Hoje',tr:'Bugün'})}</th>
                       <th className="px-6 py-3 font-semibold text-slate-500 dark:text-dk-muted text-center">{tx(lang,{fr:'Total Effectif',ar:'إجمالي الموظفين',en:'Total Staff',es:'Total Efectivo',pt:'Total Efetivos',tr:'Toplam Personel'})}</th>
                       <th className="px-6 py-3 font-semibold text-slate-500 dark:text-dk-muted text-center">{tx(lang,{fr:'Principales Catégories',ar:'الفئات الرئيسية',en:'Main Categories',es:'Principales Categorías',pt:'Principais Categorias',tr:'Ana Kategoriler'})}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allKnownChains.map(chain => {
                      const val = analyticsData.today.byChain[chain] || 0;
                      if (val === 0) return null;
                      
                      // Get top categories for this chain
                      const chainCatCounts: Record<string, number> = {};
                      const daySuivis = suivis.filter(s => s.date === analyticsData.today.date && s.chaineId === chain);
                      daySuivis.forEach(s => {
                        roles.forEach(r => {
                          const cval = Number((s as any)[r.id] || s.customEffectifs?.[r.id] || 0);
                          if (cval > 0) chainCatCounts[r.category] = (chainCatCounts[r.category] || 0) + cval;
                        });
                      });
                      
                      const topCats = Object.entries(chainCatCounts)
                        .sort((a,b) => b[1] - a[1])
                        .slice(0, 2);

                      return (
                        <tr key={chain} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-800 dark:text-dk-text">{getChainLabel(chain)}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text font-bold">
                              {val}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              {topCats.length > 0 ? topCats.map(([cat, count]) => (
                                <span key={cat} className="text-xs font-semibold px-2 py-1 bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft rounded">
                                  {cat}: {count}
                                </span>
                              )) : (
                                <span className="text-xs text-slate-400 dark:text-dk-muted italic">{tx(lang,{fr:'Non détaillé',ar:'غير مفصل',en:'Not detailed',es:'No detallado',pt:'Não detalhado',tr:'Detaylandırılmamış'})}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
