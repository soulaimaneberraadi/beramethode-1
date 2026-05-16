import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Users, ChevronDown, UserCog, Factory, Plus, Trash2, Check, X, Settings2, LayoutGrid, Globe, EyeOff, Eye, ChevronLeft, ChevronRight, Calculator, TrendingUp, TrendingDown, Activity, CalendarDays, MessageSquare, Sparkles, FileDown } from 'lucide-react';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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

const ConfirmModal = ({ isOpen, title, message, type = 'danger', onConfirm, onCancel, confirmText = 'Confirmer', cancelText = 'Annuler', hideCancel = false }: ConfirmModalProps) => {
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full ${colors.icon} shrink-0`}>
              {type === 'success' ? <Check className="w-6 h-6" /> : type === 'danger' ? <Trash2 className="w-6 h-6" /> : <Settings2 className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
          {!hideCancel && (
            <button onClick={onCancel} className="px-4 py-2 font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
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

const OBS_QUICK_LABELS = [
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
      className={`bg-amber-50/50 border border-amber-200 hover:border-amber-300 focus:bg-amber-50 focus:border-amber-400 rounded px-2 py-0.5 outline-none focus:ring-2 ring-amber-500/20 transition-all ${autoWidth || minWidth ? '' : 'w-full'} ${textClassName || className}`}
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

export default function Effectifs({ onOpenGestionRH, suivis = [], setSuivis, planningEvents = [], settings }: EffectifsPageProps) {
  const effectifsDtpSettings = settings ?? DEFAULT_CALENDAR_APP_SETTINGS;
  const [activeTab, setActiveTab] = useState<'grid' | 'analytics'>('grid');
  const [selectedChain, setSelectedChain] = useState('Toutes les chaines');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

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
      if (!res.ok) throw new Error('Export échoué');
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
        return [{ id: 'SALLES', name: 'Par Salle', items: JSON.parse(savedSalles) }];
      }
      return [{ id: 'SALLES', name: 'Par Salle', items: [{ id: 'salle_1', name: 'Salle 1' }] }];
    } catch {
      return [{ id: 'SALLES', name: 'Par Salle', items: [{ id: 'salle_1', name: 'Salle 1' }] }];
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
    if (settings?.chainsCount) {
      for (let i = 1; i <= settings.chainsCount; i++) {
        chains.add(`CHAINE ${i}`);
      }
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
        s = {
          id: `effectif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          planningId: type === 'chain' ? '' : 'standalone',
          chaineId: targetId,
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

      let total = 0;
      roles.forEach(r => {
        const val = DEFAULT_ROLES.some(dr => dr.id === r.id) || r.id in s 
          ? (s as any)[r.id] 
          : s.customEffectifs?.[r.id];
        total += Number(val) || 0;
      });
      s.totalWorkers = total;

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
      return [{ id: 'global', label: 'Global', type: 'global' as const }];
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
          label: `Historique · ${shortLabel}`,
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
      'Supprimer le rôle',
      `Retirer ce rôle de la configuration et effacer ses effectifs pour la date affichée (${selectedDate}) uniquement ? Les autres dates conservent les valeurs enregistrées dans les suivis (auditable même si le rôle n’apparaît plus dans la grille).`,
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
    setRoles(roles.map(r => r.id === id ? { ...r, isCalculated: r.isCalculated === false ? true : false } : r));
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
    requestConfirm('Supprimer la catégorie', `Voulez-vous vraiment supprimer la catégorie "${category}" et TOUS les rôles qu'elle contient ? Cette action est irréversible.`, () => {
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
    setCustomPartitions([...customPartitions, { id, name: 'Nouvelle Répartition', items: [] }]);
  };

  const handleRenamePartition = (id: string, newName: string) => {
    if (!newName.trim()) return;
    setCustomPartitions(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
  };

  const handleDeletePartition = (id: string) => {
    requestConfirm(
      'Supprimer la répartition',
      'Supprimer cette répartition ? Les lignes de suivi (effectifs) liées à ses colonnes pour la date affichée seront retirées ; les autres dates conservent l’historique et réafficheront les colonnes « Historique » si des données existent.',
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
      'Supprimer l\'élément',
      `Supprimer cette colonne ? Les valeurs enregistrées pour la date du ${selectedDate} seront effacées. Les autres dates gardent leurs données ; en les ouvrant, la colonne réapparaîtra en « Historique » si des effectifs sont encore enregistrés.`,
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
      observations.push({ type: 'positive', text: `Hausse des effectifs: +${diff} employés par rapport à hier.`, icon: <TrendingUp className="w-5 h-5 text-emerald-500"/> });
    } else if (today.total < yesterday.total) {
      const diff = yesterday.total - today.total;
      observations.push({ type: 'negative', text: `Baisse des effectifs: -${diff} employés aujourd'hui.`, icon: <TrendingDown className="w-5 h-5 text-red-500"/> });
    } else {
      observations.push({ type: 'neutral', text: `Effectifs stables: Le même nombre d'employés qu'hier (${today.total}).`, icon: <Activity className="w-5 h-5 text-blue-500"/> });
    }

    let maxCat = '';
    let maxCatVal = 0;
    Object.entries(today.byCategory).forEach(([cat, val]) => {
      if(val > maxCatVal) { maxCatVal = val; maxCat = cat; }
    });
    if (maxCat) {
      observations.push({ type: 'info', text: `La section "${maxCat}" regroupe la majorité du personnel avec ${maxCatVal} employés.`, icon: <Users className="w-5 h-5 text-indigo-500"/> });
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
      observations.push({ type: 'warning', text: `Alerte: Effectif très faible sur ${getChainLabel(shortageChain)} (${minChainVal} personnes).`, icon: <Activity className="w-5 h-5 text-amber-500"/> });
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
        <div className="bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl rounded-xl p-4">
          <p className="text-slate-500 font-bold mb-2 pb-2 border-b border-slate-100">{label}</p>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
            <span className="font-semibold text-slate-700">Total:</span>
            <span className="font-black text-indigo-600 text-lg">{payload[0].value} <span className="text-xs font-medium text-slate-400">employés</span></span>
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
    <div className="flex-1 min-h-0 w-full overflow-y-auto bg-gradient-to-b from-slate-50 via-[#fafafa] to-slate-100">
      {obsCommentOpen && obsCommentAnchor && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-violet-100 text-violet-600 shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-slate-900">Observation personnalisée</h3>
                  <p className="text-xs font-semibold text-violet-600 mt-1 truncate" title={observationAnchorTitle(obsCommentAnchor)}>
                    {observationAnchorTitle(obsCommentAnchor)}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Cette note est liée à la date et à l’emplacement indiqués ci-dessus. Elle apparaît dans le panneau Observations (Analytique) lorsque la période affichée couvre ce jour.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {OBS_QUICK_LABELS.map(label => (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      setObsCommentText(prev => {
                        const trimmed = prev.trim();
                        if (trimmed) return `${trimmed} · ${label}`;
                        return obsCommentAnchor
                          ? `${defaultObservationTextForAnchor(obsCommentAnchor).trimEnd()} · ${label}`
                          : label;
                      })
                    }
                    className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-violet-100 hover:text-violet-800 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                value={obsCommentText}
                onChange={e => setObsCommentText(e.target.value)}
                rows={4}
                placeholder="Complétez ou remplacez le texte proposé (obligatoire : ajouter du détail après les « : »)."
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 outline-none resize-y min-h-[100px]"
              />
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setObsCommentOpen(false); setObsCommentAnchor(null); setObsCommentText(''); }}
                className="px-4 py-2 font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Annuler
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
                Enregistrer
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
        confirmText={confirmDialog.type === 'success' ? 'OK' : 'Confirmer'}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
      <div className="w-full max-w-full mx-auto box-border px-2 py-1.5 sm:px-6 sm:py-6 flex flex-col gap-1.5 sm:gap-8 min-w-0">
        
        {/* HEADER & FILTERS — ultra-compact téléphone */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-1.5 sm:gap-4 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <div className="p-1.5 sm:p-3 bg-indigo-100 text-indigo-600 rounded-md sm:rounded-xl shadow-sm shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-2xl font-black text-slate-800 tracking-tight leading-tight">Effectifs</h1>
              <p className="hidden sm:block text-sm text-slate-500 font-medium leading-snug">
                Répartition du personnel par chaîne, salle et date
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap items-stretch sm:items-center gap-1 sm:gap-3 w-full min-w-0 lg:w-auto lg:justify-end lg:shrink">
            <div
              className="flex bg-slate-100 p-0.5 sm:p-1 rounded-md sm:rounded-xl shadow-inner w-full sm:w-auto shrink-0"
              role="tablist"
              aria-label="Mode d'affichage Effectifs"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'grid'}
                onClick={() => setActiveTab('grid')}
                className={`flex-1 sm:flex-none px-1.5 py-1 sm:px-6 sm:py-2.5 rounded sm:rounded-lg text-[10px] sm:text-sm font-bold flex items-center justify-center gap-0.5 sm:gap-2 transition-all duration-300 ${activeTab === 'grid' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
              >
                <LayoutGrid className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" aria-hidden /> Saisie
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'analytics'}
                onClick={() => setActiveTab('analytics')}
                className={`flex-1 sm:flex-none px-1.5 py-1 sm:px-6 sm:py-2.5 rounded sm:rounded-lg text-[10px] sm:text-sm font-bold flex items-center justify-center gap-0.5 sm:gap-2 transition-all duration-300 ${activeTab === 'analytics' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
              >
                <Activity className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" aria-hidden /> Analytique
              </button>
            </div>

            {onOpenGestionRH && (
              <button
                type="button"
                onClick={onOpenGestionRH}
                aria-label="Gestion RH détaillée"
                className="px-2 py-1 sm:px-4 sm:py-2 bg-sky-50 text-sky-600 hover:bg-sky-100 font-bold rounded-md sm:rounded-xl flex items-center justify-center sm:justify-start gap-1 sm:gap-2 transition-colors shadow-sm text-[10px] sm:text-sm w-full sm:w-auto shrink-0"
              >
                <UserCog className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" aria-hidden />
                <span className="sm:hidden">RH</span>
                <span className="hidden sm:inline">Gestion RH Détaillée</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportPointage}
              disabled={exportingPointage}
              aria-label="Exporter pointage mensuel Excel"
              title={`Exporter pointage ${selectedDate.slice(0, 7)}${selectedChain !== 'Toutes les chaines' ? ` — ${selectedChain}` : ''}`}
              className="px-2 py-1 sm:px-4 sm:py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 font-bold rounded-md sm:rounded-xl flex items-center justify-center sm:justify-start gap-1 sm:gap-2 transition-colors shadow-sm text-[10px] sm:text-sm w-full sm:w-auto shrink-0"
            >
              <FileDown className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" aria-hidden />
              <span className="sm:hidden">{exportingPointage ? '…' : 'Excel'}</span>
              <span className="hidden sm:inline">{exportingPointage ? 'Export…' : 'Export Mensuel'}</span>
            </button>

            <div className="relative w-full sm:w-auto sm:min-w-[11rem] sm:max-w-[min(100%,22rem)] min-w-0">
              <select
                value={selectedChain}
                onChange={(e) => setSelectedChain(e.target.value)}
                aria-label="Filtrer par chaîne"
                title={selectedChain === 'Toutes les chaines' ? 'Toutes les chaînes' : getChainLabel(selectedChain)}
                className="appearance-none min-h-[44px] w-full min-w-0 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-xs font-bold leading-snug text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 sm:min-h-0 sm:rounded-xl sm:py-2.5 sm:pl-4 sm:pr-9 sm:text-sm truncate"
              >
                <option value="Toutes les chaines">Toutes</option>
                {allKnownChains.map(c => <option key={c} value={c}>{getChainLabel(c)}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-slate-400 sm:right-3 sm:h-4 sm:w-4" aria-hidden />
            </div>

            <div className="flex items-center bg-white border border-slate-200 rounded-md sm:rounded-xl shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-300 transition-all w-full sm:w-auto min-w-0 justify-stretch">
              <button 
                type="button"
                onClick={() => changeDate(-1)}
                className="p-1 sm:p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors border-r border-slate-100 focus:outline-none shrink-0"
                title="Jour précédent"
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
                  inputClassName="min-h-[30px] w-full border-0 bg-transparent text-center text-[10px] font-bold text-slate-700 shadow-none outline-none focus:ring-2 focus:ring-indigo-500/25 sm:min-h-[36px] sm:text-sm py-1 px-1 rounded-md"
                />
              </div>

              <button 
                type="button"
                onClick={() => changeDate(1)}
                className="p-1 sm:p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors border-l border-slate-100 focus:outline-none shrink-0"
                title="Jour suivant"
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
                  title={gridRoleToolsOpen || isEditMode || isAddingRole ? 'Masquer les actions rôles / salles' : 'Afficher les actions rôles / salles'}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg sm:rounded-xl border px-2.5 py-1.5 text-[11px] font-bold shadow-sm transition-colors sm:justify-center sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${
                    gridRoleToolsOpen || isEditMode || isAddingRole
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex min-w-0 items-center justify-center gap-2">
                    <Settings2 className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate sm:hidden">Réglages rôles</span>
                    <span className="hidden truncate sm:inline">Réglages — Rôles &amp; Salles</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${gridRoleToolsOpen || isEditMode || isAddingRole ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>

                {(gridRoleToolsOpen || isEditMode || isAddingRole) && (
                  <div
                    className="flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/90 shadow-sm divide-y divide-slate-200 sm:flex-row sm:divide-x sm:divide-y-0"
                    role="group"
                    aria-label="Configurer les rôles et créer un rôle"
                  >
                    <button
                      type="button"
                      onClick={() => { setIsEditMode(!isEditMode); setIsAddingRole(false); }}
                      title={isEditMode ? 'Terminer la configuration' : 'Configurer les Rôles / Salles'}
                      className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-center text-xs font-bold leading-tight transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                        isEditMode ? 'bg-amber-100 text-amber-800' : 'bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Settings2 className="w-4 h-4 shrink-0" aria-hidden />
                      {isEditMode ? (
                        <>
                          <span className="sm:hidden">Terminer</span>
                          <span className="hidden sm:inline">Terminer la configuration</span>
                        </>
                      ) : (
                        <>
                          <span className="sm:hidden">Configurer</span>
                          <span className="hidden sm:inline">Configurer les Rôles / Salles</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsAddingRole(!isAddingRole); setIsEditMode(false); }}
                      className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-center text-xs font-bold leading-tight transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                        isAddingRole ? 'bg-indigo-800 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {isAddingRole ? <X className="w-4 h-4 shrink-0" aria-hidden /> : <Plus className="w-4 h-4 shrink-0" aria-hidden />}
                      <span className="max-sm:whitespace-normal">{isAddingRole ? 'Fermer' : 'Nouveau Rôle'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

        {/* EDIT CONFIG PANEL */}
        {isEditMode && (
          <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-5 shadow-sm mb-2 flex flex-col gap-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-amber-900 flex items-center gap-2"><LayoutGrid className="w-4 h-4"/> Gestion des Répartitions Personnalisées</h3>
                <button onClick={handleAddPartition} className="text-xs font-bold bg-amber-200 text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-300 transition-colors flex items-center gap-1 shadow-sm">
                  <Plus className="w-3.5 h-3.5" /> Nouvelle Répartition
                </button>
              </div>

              <div className="flex flex-col gap-4">
                {customPartitions.map(partition => (
                  <div key={partition.id} className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col gap-3">
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
                        <div key={item.id} className="bg-amber-50 border border-amber-200 px-2 py-1.5 rounded-lg text-sm font-bold text-amber-800 flex items-center gap-1 group">
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
                          placeholder="Nouvel élément..."
                          className="px-3 py-1.5 rounded-lg border border-amber-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 w-36 bg-amber-50 placeholder-amber-400/70 text-amber-900"
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
              <p className="font-semibold mb-2 flex items-center gap-2"><UserCog className="w-4 h-4"/> Astuces d'historique (Masquage) :</p>
              <ul className="list-disc list-inside space-y-1.5 opacity-90 ml-1">
                <li>Vous pouvez masquer (<EyeOff className="w-3.5 h-3.5 inline" />) un rôle ou une catégorie si vous n'en avez plus besoin.</li>
                <li>Si un rôle masqué a des données pour la date sélectionnée, il restera visible pour éviter de perdre l'historique !</li>
                <li>Les colonnes « Historique » ne reprennent que les suivis saisis comme effectifs autonomes (sans ordre planning), pour éviter les totaux faux venant de la production ; affichage limité à {MAX_HISTORICAL_PARTITION_COLS} colonnes.</li>
              </ul>
            </div>
          </div>
        )}

        {isAddingRole && (
          <div className="px-5 py-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl flex flex-wrap items-end gap-4 shadow-sm mb-4">
            <div>
              <label className="block text-xs font-bold text-indigo-800 mb-1">Catégorie</label>
              <div className="flex gap-2">
                <select 
                  value={newRole.category}
                  onChange={e => { setNewRole({...newRole, category: e.target.value}); setNewCategory(''); }}
                  className="pl-3 pr-8 py-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  {Object.keys(rolesByCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  <option value="NEW">+ Nouvelle Catégorie</option>
                </select>
                {newRole.category === 'NEW' && (
                  <input 
                    type="text" 
                    placeholder="Nom de la catégorie"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="px-3 py-2 border border-indigo-200 rounded-lg text-sm w-48 focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-indigo-800 mb-1">Nom du Rôle / Poste</label>
              <input 
                type="text" 
                placeholder="Ex: Machine Laser, Coupe..."
                value={newRole.label}
                onChange={e => setNewRole({...newRole, label: e.target.value})}
                className="px-3 py-2 border border-indigo-200 rounded-lg text-sm w-full max-w-xs sm:w-64 focus:ring-2 focus:ring-indigo-500 bg-white"
                onKeyDown={e => e.key === 'Enter' && handleAddRole()}
              />
            </div>
            <button 
              onClick={handleAddRole}
              disabled={!newRole.label || (newRole.category === 'NEW' && !newCategory)}
              className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> Ajouter
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
            <div key={category} className={`bg-white border ${config.isHidden ? 'border-slate-200/50 opacity-75' : 'border-slate-200'} shadow-sm rounded-2xl flex flex-col w-full`}>
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-4 justify-between items-center">
                <div className="flex items-center gap-3 flex-shrink-0">
                  {isEditMode && (
                    <button 
                      onClick={() => toggleCategoryVisibility(category)}
                      className={`p-1.5 rounded-lg transition-colors ${config.isHidden ? 'bg-slate-200 text-slate-500' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'}`}
                      title={config.isHidden ? "Afficher cette catégorie" : "Masquer cette catégorie"}
                    >
                      {config.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                  {isEditMode ? (
                    <div className="flex items-center gap-2">
                      <EditableText 
                        value={category} 
                        onSave={(newVal) => handleRenameCategory(category, newVal)} 
                        textClassName="text-lg font-bold text-slate-800"
                        minWidth={260}
                      />
                      {config.isHidden && <span className="text-xs font-normal text-slate-500">(Masquée)</span>}
                      <button 
                        onClick={() => handleDeleteCategory(category)}
                        className="p-1.5 ml-2 rounded-lg transition-colors bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600"
                        title="Supprimer cette catégorie"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <h2 className="text-lg font-bold text-slate-800">{category} {config.isHidden && <span className="text-xs font-normal text-slate-500 ml-2">(Masquée)</span>}</h2>
                  )}
                </div>
                {isEditMode && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">Répartition:</span>
                    <select 
                      value={config.displayBy}
                      onChange={e => updateCategoryDisplayBy(category, e.target.value)}
                      className="text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-500 outline-none max-w-[160px]"
                    >
                      <option value="CHAINES">Par Chaine</option>
                      <option value="GLOBAL">Globale</option>
                      {customPartitions.length > 0 && (
                        <optgroup label="Personnalisées">
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
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-2 py-2 text-xs font-semibold text-slate-600 whitespace-normal leading-snug sm:px-4 sm:py-3 sm:text-sm sticky left-0 z-10 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0] min-w-[6.75rem] w-[28vw] max-w-[10rem] sm:min-w-[11rem] sm:w-44 sm:max-w-none md:min-w-[14rem] md:w-56 lg:w-64 lg:min-w-[16rem]">
                        Rôle / {config.displayBy === 'CHAINES' ? 'Chaine' : config.displayBy === 'GLOBAL' ? 'Global' : customPartitions.find(p => p.id === config.displayBy)?.name || 'Partition'}
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
                              ? `Clic droit : ajouter une observation · ${colNotesCount} note(s) pour cette colonne et cette date`
                              : 'Clic droit : ajouter une observation'
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
                              ? 'bg-amber-50/95 text-amber-950 border-l border-amber-200/80'
                              : 'text-slate-800'
                          }`}
                        >
                          {colNotesCount > 0 && (
                            <span
                              className="absolute top-1.5 right-1.5 min-w-[1.125rem] h-[1.125rem] px-1 flex items-center justify-center rounded-full bg-violet-600 text-white text-[10px] font-black leading-none shadow-sm z-20"
                              aria-hidden
                            >
                              {colNotesCount > 9 ? '9+' : colNotesCount}
                            </span>
                          )}
                          <div className="flex flex-col items-center">
                            <span>{c.label}</span>
                            <span className="text-xs font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full mt-1">
                              Total: {calculateTotalForCol(c.id, c.type, category)}
                            </span>
                          </div>
                        </th>
                      );
                      })}
                      <th className="px-2 py-2 sm:px-4 sm:py-3 font-bold text-slate-800 text-center text-xs sm:text-sm bg-slate-100/50 min-w-[3.25rem] sm:min-w-[5rem]">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRoles.map(row => {
                      const totalRow = calculateTotalForRow(row.id, category);
                      return (
                      <tr key={row.id} className={`hover:bg-slate-50/50 transition-colors group ${row.isArchived ? 'opacity-60 bg-slate-50' : ''}`}>
                        <td className={`px-2 py-2 sm:px-4 sm:py-3 font-medium text-slate-700 bg-white group-hover:bg-slate-50/50 sticky left-0 shadow-[1px_0_0_0_#e2e8f0] z-10 flex flex-wrap items-center justify-between gap-x-1 gap-y-1 min-w-[6.75rem] w-[28vw] max-w-[10rem] sm:min-w-[11rem] sm:w-44 sm:max-w-none md:min-w-[12rem] md:w-auto md:max-w-none lg:min-w-[200px] ${row.isArchived ? 'bg-slate-50' : ''}`}>
                          <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
                            {isEditMode ? (
                              <EditableText 
                                value={row.label} 
                                onSave={(newVal) => handleRenameRole(row.id, newVal)} 
                                textClassName={`text-sm font-bold ${row.isArchived ? 'text-slate-500 line-through' : 'text-slate-800'}`}
                              />
                            ) : (
                              <span className={`break-words ${row.isArchived ? 'line-through decoration-slate-400' : ''}`}>{row.label}</span>
                            )}
                          </div>
                          
                          {isEditMode && (
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => handleToggleCalculated(row.id)}
                                className={`p-1.5 rounded-lg transition-colors ${row.isCalculated !== false ? 'text-emerald-600 bg-emerald-100 hover:bg-emerald-200' : 'text-slate-400 bg-slate-100 hover:bg-slate-200'}`}
                                title={row.isCalculated !== false ? "Inclus dans le calcul de rendement" : "Exclu du calcul de rendement"}
                              >
                                <Calculator className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => toggleArchiveRole(row.id)}
                                className={`p-1.5 rounded-lg transition-colors ${row.isArchived ? 'bg-slate-200 text-slate-500' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                                title={row.isArchived ? "Restaurer ce rôle" : "Masquer ce rôle"}
                              >
                                {row.isArchived ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                              <button 
                                onClick={() => handleDeleteRole(row.id)}
                                className="p-1.5 rounded-lg transition-colors bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600"
                                title="Supprimer définitivement"
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
                              className={`px-2 py-2 text-center ${c.type === 'custom' && c.isHistorical ? 'bg-amber-50/50' : ''}`}
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
                                className={`w-16 text-center font-bold border-b-2 bg-transparent transition-colors focus:outline-none ${row.isArchived ? 'text-slate-500 border-slate-200 focus:border-slate-400' : 'text-indigo-700 border-slate-200 hover:border-indigo-300 focus:border-indigo-500'}`}
                                placeholder="0"
                              />
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center font-black text-indigo-600 bg-slate-100/50">
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
              <div className="bg-white rounded-lg sm:rounded-2xl p-2 sm:p-5 shadow-sm border border-slate-200 flex flex-col gap-0.5 sm:gap-2">
                <div className="text-[10px] sm:text-sm font-bold text-slate-500 flex items-center gap-1 sm:gap-2"><Users className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" /> Effectif Total Aujourd'hui</div>
                <div className="text-lg sm:text-3xl font-black text-slate-800 leading-none tabular-nums">{analyticsData.today.total}</div>
                <div className={`text-[10px] sm:text-sm font-semibold flex items-center gap-0.5 sm:gap-1 ${analyticsData.today.total >= analyticsData.yesterday.total ? 'text-emerald-500' : 'text-red-500'}`}>
                  {analyticsData.today.total >= analyticsData.yesterday.total ? <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" /> : <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />}
                  {Math.abs(analyticsData.today.total - analyticsData.yesterday.total)} vs hier
                </div>
              </div>
              <div className="bg-white rounded-lg sm:rounded-2xl p-2 sm:p-5 shadow-sm border border-slate-200 flex flex-col gap-0.5 sm:gap-2 min-w-0">
                <div className="text-[10px] sm:text-sm font-bold text-slate-500 flex items-center gap-1 sm:gap-2"><Factory className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" /> Chaine la plus peuplée</div>
                {(() => {
                  let max = 0; let name = '-';
                  Object.entries(analyticsData.today.byChain).forEach(([c, v]) => {
                    if (v > max && c !== 'global' && !c.startsWith('salle_') && !c.startsWith('part_')) { max = v; name = getChainLabel(c); }
                  });
                  return (
                    <>
                      <div className="text-lg sm:text-3xl font-black text-slate-800 leading-none truncate" title={name}>{name}</div>
                      <div className="text-[10px] sm:text-sm font-semibold text-indigo-500">{max} employés</div>
                    </>
                  );
                })()}
              </div>
              <div className="bg-white rounded-lg sm:rounded-2xl p-2 sm:p-5 shadow-sm border border-slate-200 flex flex-col gap-0.5 sm:gap-2">
                <div className="text-[10px] sm:text-sm font-bold text-slate-500 flex items-center gap-1 sm:gap-2"><CalendarDays className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" /> Moyenne 30 jours</div>
                {(() => {
                  const avg = Math.round(analyticsData.dailyStats.reduce((sum, d) => sum + d.total, 0) / 30);
                  return (
                    <>
                      <div className="text-lg sm:text-3xl font-black text-slate-800 leading-none tabular-nums">{avg}</div>
                      <div className="text-[10px] sm:text-sm font-semibold text-slate-500">Employés par jour</div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Main Chart & Observations */}
            <div className="grid grid-cols-1 gap-2 sm:gap-6 lg:grid-cols-3 lg:items-start">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-lg sm:rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
                <div className="p-2 sm:p-5 border-b border-slate-100 bg-slate-50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <h3 className="text-sm sm:text-lg font-bold text-slate-800 flex items-center gap-2 min-w-0 shrink-0">
                    <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500 shrink-0" />
                    <span className="min-w-0 leading-tight">Évolution des Effectifs</span>
                  </h3>
                  
                  {/* Chart Filters — colonne pleine largeur sur téléphone (lisible + zone tactile), ligne sur sm+ */}
                  <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-[min(100%,28rem)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
                    <select
                      value={analyticsTimeframe}
                      onChange={(e) => setAnalyticsTimeframe(e.target.value as '30' | '7')}
                      aria-label="Période du graphique"
                      className="min-h-[44px] w-full shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0 sm:w-auto sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-xs"
                    >
                      <option value="30">30 Jours</option>
                      <option value="7">7 Jours</option>
                    </select>
                    
                    <select
                      value={analyticsFilterChain}
                      onChange={(e) => setAnalyticsFilterChainFromChart(e.target.value)}
                      aria-label="Chaîne pour le graphique"
                      className="min-h-[44px] w-full shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0 sm:w-auto sm:min-w-[8rem] sm:max-w-[120px] sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-xs"
                    >
                      <option value="Toutes">Toutes les chaines</option>
                      {allKnownChains.map(c => <option key={c} value={c}>{getChainLabel(c)}</option>)}
                    </select>

                    <select
                      value={analyticsFilterCategory}
                      onChange={(e) => setAnalyticsFilterCategory(e.target.value)}
                      aria-label="Catégorie pour le graphique"
                      className="min-h-[44px] w-full shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0 sm:w-auto sm:min-w-[8rem] sm:max-w-[140px] sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-xs"
                    >
                      <option value="Toutes">Toutes les catégories</option>
                      {Object.keys(rolesByCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                </div>
                
                <div className="relative flex min-h-0 flex-1 flex-col p-2 sm:p-6">
                  {analyticsData.dailyStats.every(s => s.total === 0) ? (
                    <div className="flex flex-1 items-center justify-center text-slate-400 font-medium italic text-xs sm:text-base">
                      Aucune donnée pour les critères sélectionnés.
                    </div>
                  ) : (
                    <div className="h-[160px] w-full shrink-0 sm:h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
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
                            dataKey="total" 
                            stroke="none" 
                            fill="url(#colorTotal)" 
                          />
                          <Line 
                            type="monotone" 
                            dataKey="total" 
                            stroke="#6366f1" 
                            strokeWidth={3} 
                            dot={renderChartDot}
                            activeDot={renderChartActiveDot}
                            animationDuration={1500}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
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
                      <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-indigo-600/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-indigo-700 ring-1 ring-indigo-500/15 sm:mb-2 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.14em]">
                        <Sparkles className="h-2.5 w-2.5 shrink-0 text-indigo-600 sm:h-3 sm:w-3" aria-hidden />
                        Veille & notes
                      </span>
                      <h3 className="flex items-center gap-2 text-base font-black tracking-tight text-slate-900 sm:gap-3 sm:text-xl">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/35 ring-2 ring-white/50 sm:h-11 sm:w-11 sm:rounded-2xl">
                          <Eye className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.25} />
                        </span>
                        Observations
                      </h3>
                    </div>
                  </div>

                  <div className="mb-3 rounded-lg border border-indigo-100/90 bg-white/75 px-2.5 py-2 text-[10px] font-medium leading-snug text-slate-600 shadow-inner shadow-indigo-500/[0.04] backdrop-blur-sm sm:mb-5 sm:rounded-xl sm:px-4 sm:py-3 sm:text-xs sm:leading-relaxed">
                    <span className="font-bold text-indigo-800">Astuce :</span>{' '}
                    clic droit sur une colonne en <span className="font-semibold text-slate-800">Saisie</span>, ou sur un point du graphique, pour ancrer une note. Elle s’affiche ici pour la période couverte.
                  </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch]">
                  <div className="flex flex-col gap-5 pb-1">
                    {analyticsData.observations.length > 0 && (
                      <div>
                        <p className="mb-2.5 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
                          <span className="h-px flex-1 max-w-[2rem] rounded-full bg-gradient-to-r from-transparent to-slate-300" />
                          Détections automatiques
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
                                className={`group relative overflow-hidden rounded-xl border border-slate-200/80 border-l-[3px] bg-gradient-to-r ${accent} p-3.5 pl-4 shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-sm ring-1 ring-slate-200/60 transition-transform group-hover:scale-[1.03]">
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
                          Vos annotations
                          <span className="h-px flex-1 rounded-full bg-gradient-to-l from-transparent to-violet-300" />
                        </p>
                        <div className="flex flex-col gap-2.5">
                          {userNotesForAnalyticsPanel.map(note => (
                            <div
                              key={note.id}
                              className="group relative overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/40 p-4 shadow-md shadow-violet-500/10 ring-1 ring-white/80 transition-all duration-200 hover:-translate-y-px hover:shadow-lg hover:shadow-violet-500/15"
                            >
                              <div className="pointer-events-none absolute right-0 top-0 h-16 w-16 translate-x-6 -translate-y-6 rounded-full bg-violet-400/10" />
                              <div className="relative flex items-start gap-3">
                                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30">
                                  <MessageSquare className="h-5 w-5" strokeWidth={2} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className="mb-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700/90"
                                    title={`${observationAnchorTitle(note.anchor)} — ${observationNoteDisplayBody(note.text, note.anchor)}`}
                                  >
                                    <span className="shrink-0 rounded-md bg-violet-200/70 px-1.5 py-0.5 font-black text-violet-900">
                                      {note.anchor.kind === 'chart_day' ? 'Courbe' : 'Colonne'}
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
                                  title="Supprimer cette observation"
                                  aria-label="Supprimer cette observation"
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
                      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/50 py-10 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ring-4 ring-slate-50">
                          <MessageSquare className="h-7 w-7" strokeWidth={1.5} />
                        </div>
                        <p className="max-w-[240px] text-sm font-medium text-slate-500">
                          Aucune observation pour cette période. Ajoutez une note depuis la saisie ou le graphique.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                </div>
              </div>
            </div>

            {/* Detailed Analytics Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-slate-500" /> Répartition par Chaîne & Catégorie
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white">
                    <tr className="border-b border-slate-100">
                      <th className="px-6 py-3 font-semibold text-slate-500">Aujourd'hui</th>
                      <th className="px-6 py-3 font-semibold text-slate-500 text-center">Total Effectif</th>
                      <th className="px-6 py-3 font-semibold text-slate-500 text-center">Principales Catégories</th>
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
                        <tr key={chain} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-800">{getChainLabel(chain)}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 font-bold">
                              {val}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              {topCats.length > 0 ? topCats.map(([cat, count]) => (
                                <span key={cat} className="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-600 rounded">
                                  {cat}: {count}
                                </span>
                              )) : (
                                <span className="text-xs text-slate-400 italic">Non détaillé</span>
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
