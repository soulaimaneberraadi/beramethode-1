import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { 
  Scissors, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  AlertTriangle, 
  Activity, 
  Gauge, 
  Settings, 
  Clock, 
  ChevronLeft, 
  ArrowRight, 
  Layers, 
  Component, 
  Info, 
  Type, 
  ToggleLeft, 
  ToggleRight, 
  CheckCircle2,
  RotateCcw
} from 'lucide-react';
import { Machine, SpeedFactor, ComplexityFactor, StandardTime, Guide } from '../types';
import { STITCH_TYPES, StitchType } from '../data/threadConsumption';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

interface MachinProps {
  machines: Machine[];
  onSaveMachine: (machine: Machine) => void;
  onDeleteMachine: (id: string) => void;
  onToggleMachine: (id: string) => void;
  machineInstances?: any[];
  onSaveMachineInstance?: any;
  onDeleteMachineInstance?: any;
  parcMachinesOpenSignal?: number;
  onPurgeAllMachineClasses?: () => void;
  
  // Props for State Management
  speedFactors: SpeedFactor[];
  setSpeedFactors: React.Dispatch<React.SetStateAction<SpeedFactor[]>>;
  complexityFactors: ComplexityFactor[];
  setComplexityFactors: React.Dispatch<React.SetStateAction<ComplexityFactor[]>>;
  standardTimes: StandardTime[];
  setStandardTimes: React.Dispatch<React.SetStateAction<StandardTime[]>>;
  guides: Guide[];
  setGuides: React.Dispatch<React.SetStateAction<Guide[]>>;
  
  // Autocomplete Settings
  isAutocompleteEnabled?: boolean;
  setIsAutocompleteEnabled?: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function Machin({ 
  machines, 
  onSaveMachine, 
  onDeleteMachine, 
  onToggleMachine,
  speedFactors,
  setSpeedFactors,
  complexityFactors,
  setComplexityFactors,
  standardTimes,
  setStandardTimes,
  guides,
  setGuides,
  isAutocompleteEnabled = true,
  setIsAutocompleteEnabled
}: MachinProps) {
  const { lang } = useLang();
  // Navigation State: 'menu' is the landing page with buttons
  const [currentView, setCurrentView] = useState<'menu' | 'machines' | 'standards' | 'guides' | 'fil'>('menu');
  const [searchTerm, setSearchTerm] = useState('');
  
  // --- MODAL STATES ---
  const [modalType, setModalType] = useState<'machine' | 'speed' | 'complexity' | 'time' | 'guide' | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null); 
  
  // Delete Modal State
  const [deleteData, setDeleteData] = useState<{ type: 'machine' | 'speed' | 'complexity' | 'time' | 'guide', id: string } | null>(null);

  // Form Data States
  const [machineForm, setMachineForm] = useState<Partial<Machine>>({ name: '', classe: '', speed: 0, speedMajor: 1.01, cofs: 0, active: true });
  const [speedForm, setSpeedForm] = useState<Partial<SpeedFactor>>({ min: 0, max: 0, value: 1.0 });
  const [complexityForm, setComplexityForm] = useState<Partial<ComplexityFactor>>({ label: '', value: 1.0 });
  const [timeForm, setTimeForm] = useState<Partial<StandardTime>>({ label: '', value: 0, unit: 'min' });
  const [guideForm, setGuideForm] = useState<Partial<Guide>>({ name: '', category: '', machineType: '', description: '', useCase: '' });
  const [machineErrors, setMachineErrors] = useState<{ name: boolean; classe: boolean }>({ name: false, classe: false });
  const [guideErrors, setGuideErrors] = useState<{ name: boolean; category: boolean; machineType: boolean }>({
    name: false,
    category: false,
    machineType: false,
  });

  // --- FIL CONSUMPTION STATES ---
  const [filTypes, setFilTypes] = useState<StitchType[]>(() => {
    const saved = localStorage.getItem('beramethode_fil_types');
    return saved ? JSON.parse(saved) : [...STITCH_TYPES];
  });
  const [filEditIndex, setFilEditIndex] = useState<number | null>(null);
  const [filForm, setFilForm] = useState<StitchType>({ code: '', name: '', nameAr: '', isoNumber: 0, threadCount: 1, consumptionFactor: 0, machineCode: '', observations: '' });
  const [filConfirmOpen, setFilConfirmOpen] = useState(false);
  const [filResetConfirmOpen, setFilResetConfirmOpen] = useState(false);
  const filHasChanges = useMemo(() => {
    return JSON.stringify(filTypes) !== JSON.stringify(STITCH_TYPES);
  }, [filTypes]);

  // Filter Logic
  const filteredMachines = useMemo(() => {
    return machines.filter(m => 
      (m.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.classe || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [machines, searchTerm]);

  // Grouped Guides Logic
  const groupedGuides = useMemo(() => {
    const filtered = guides.filter(g => 
        (g.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (g.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (g.useCase || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const groups: Record<string, Guide[]> = {};
    
    // Get list of active machine names/classes for prioritization
    const activeMachineNames = machines.filter(m => m.active).map(m => (m.name || '').toLowerCase());
    const activeMachineClasses = machines.filter(m => m.active).map(m => (m.classe || '').toLowerCase());

    filtered.forEach(g => {
        const mType = g.machineType || 'Divers / Autres';
        const mTypeLower = (mType || '').toLowerCase();
        
        // Determine if this guide matches a machine in our fleet
        let groupKey = mType;
        
        // Check if matching
        const isFleet = activeMachineNames.some(am => mTypeLower.includes(am)) || activeMachineClasses.some(ac => mTypeLower.includes(ac)) || mTypeLower.includes('piqueuse'); // Default include Piqueuse as common

        if (!isFleet) {
            groupKey = "Autres / Non-Assigné";
        }

        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(g);
    });

    return groups;
  }, [guides, searchTerm, machines]);
  
  // --- HANDLERS ---
  const openMachineModal = (machine?: Machine) => {
    setModalType('machine');
    setMachineErrors({ name: false, classe: false });
    if (machine) {
      setEditingItem(machine);
      setMachineForm(machine);
    } else {
      setEditingItem(null);
      setMachineForm({ name: '', classe: '', speed: 2000, speedMajor: 1.01, cofs: 1.0, active: true });
    }
  };

  const saveMachine = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = {
      name: !(machineForm.name || '').trim(),
      classe: !(machineForm.classe || '').trim(),
    };
    setMachineErrors(nextErrors);
    if (nextErrors.name || nextErrors.classe) return;
    const toSave: Machine = { ...(machineForm as Machine), id: editingItem?.id || Date.now().toString() };
    onSaveMachine(toSave);
    closeModal();
  };

  const openSpeedModal = (item?: SpeedFactor) => {
    setModalType('speed');
    if (item) {
      setEditingItem(item);
      setSpeedForm(item);
    } else {
      setEditingItem(null);
      setSpeedForm({ min: 0, max: 0, value: 1.01 });
    }
  };

  const saveSpeed = (e: React.FormEvent) => {
    e.preventDefault();
    const toSave: SpeedFactor = { ...(speedForm as SpeedFactor), id: editingItem?.id || Date.now().toString() };
    if (editingItem) {
      setSpeedFactors(prev => prev.map(i => i.id === editingItem.id ? toSave : i));
    } else {
      setSpeedFactors(prev => [...prev, toSave]);
    }
    closeModal();
  };

  const openComplexityModal = (item?: ComplexityFactor) => {
    setModalType('complexity');
    if (item) {
      setEditingItem(item);
      setComplexityForm(item);
    } else {
      setEditingItem(null);
      setComplexityForm({ label: '', value: 1.1 });
    }
  };

  const saveComplexity = (e: React.FormEvent) => {
    e.preventDefault();
    const toSave: ComplexityFactor = { ...(complexityForm as ComplexityFactor), id: editingItem?.id || Date.now().toString() };
    if (editingItem) {
      setComplexityFactors(prev => prev.map(i => i.id === editingItem.id ? toSave : i));
    } else {
      setComplexityFactors(prev => [...prev, toSave]);
    }
    closeModal();
  };

  const openTimeModal = (item?: StandardTime) => {
    setModalType('time');
    if (item) {
      setEditingItem(item);
      setTimeForm(item);
    } else {
      setEditingItem(null);
      setTimeForm({ label: '', value: 0.01, unit: 'min' });
    }
  };

  const saveTime = (e: React.FormEvent) => {
    e.preventDefault();
    const toSave: StandardTime = { ...(timeForm as StandardTime), id: editingItem?.id || Date.now().toString() };
    if (editingItem) {
      setStandardTimes(prev => prev.map(i => i.id === editingItem.id ? toSave : i));
    } else {
      setStandardTimes(prev => [...prev, toSave]);
    }
    closeModal();
  };

  const openGuideModal = (item?: Guide) => {
    setModalType('guide');
    setGuideErrors({ name: false, category: false, machineType: false });
    if (item) {
      setEditingItem(item);
      setGuideForm(item);
    } else {
      setEditingItem(null);
      setGuideForm({ name: '', category: '', machineType: '', description: '', useCase: '' });
    }
  };

  const saveGuide = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = {
      name: !(guideForm.name || '').trim(),
      category: !(guideForm.category || '').trim(),
      machineType: !(guideForm.machineType || '').trim(),
    };
    setGuideErrors(nextErrors);
    if (nextErrors.name || nextErrors.category || nextErrors.machineType) return;
    const toSave: Guide = { ...(guideForm as Guide), id: editingItem?.id || Date.now().toString() };
    if (editingItem) {
      setGuides(prev => prev.map(i => i.id === editingItem.id ? toSave : i));
    } else {
      setGuides(prev => [...prev, toSave]);
    }
    closeModal();
  };
  
  const closeModal = () => {
    setModalType(null);
    setEditingItem(null);
    setMachineErrors({ name: false, classe: false });
    setGuideErrors({ name: false, category: false, machineType: false });
  };

  const confirmDelete = () => {
    if (!deleteData) return;
    const { type, id } = deleteData;
    
    if (type === 'machine') onDeleteMachine(id);
    else if (type === 'speed') setSpeedFactors(prev => prev.filter(i => i.id !== id));
    else if (type === 'complexity') setComplexityFactors(prev => prev.filter(i => i.id !== id));
    else if (type === 'time') setStandardTimes(prev => prev.filter(i => i.id !== id));
    else if (type === 'guide') setGuides(prev => prev.filter(i => i.id !== id));
    
    setDeleteData(null);
  };

  // --- FIL HANDLERS ---
  const openFilEdit = (index: number) => {
    setFilEditIndex(index);
    setFilForm({ ...filTypes[index] });
  };

  const saveFilEdit = () => {
    if (filEditIndex === null) return;
    if (filEditIndex === -1) {
      setFilTypes(prev => [...prev, { ...filForm } as StitchType]);
    } else {
      setFilTypes(prev => {
        const next = [...prev];
        next[filEditIndex] = { ...next[filEditIndex], ...filForm } as StitchType;
        return next;
      });
    }
    setFilEditIndex(null);
    setFilForm({ code: '', name: '', nameAr: '', isoNumber: 0, threadCount: 1, consumptionFactor: 0, machineCode: '', observations: '' });
  };

  const confirmFilSave = () => {
    localStorage.setItem('beramethode_fil_types', JSON.stringify(filTypes));
    setFilConfirmOpen(false);
  };

  const resetFilDefaults = () => {
    setFilTypes([...STITCH_TYPES]);
    localStorage.removeItem('beramethode_fil_types');
    setFilResetConfirmOpen(false);
  };

  // --- MENU CARD COMPONENT ---
  const MenuCard = ({ 
    title, 
    desc, 
    icon: Icon, 
    colorClass, 
    bgClass, 
    onClick 
  }: { 
    title: string, 
    desc: string, 
    icon: any, 
    colorClass: string, 
    bgClass: string,
    onClick: () => void 
  }) => (
    <motion.button 
      whileHover={{ y: -8, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white dark:bg-dk-surface p-6 rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm hover:shadow-xl hover:border-emerald-200 transition-all text-left group flex flex-col h-full premium-glow"
    >
      <div className={`w-14 h-14 rounded-2xl ${bgClass} ${colorClass} flex items-center justify-center mb-6 shadow-sm group-hover:rotate-6 transition-transform duration-300`}>
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-xl font-bold text-slate-800 mb-2 group-hover:text-emerald-700 transition-colors">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed mb-6 flex-1">{desc}</p>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-400 group-hover:text-emerald-600 transition-colors">
        <span>{tx(lang, { fr: 'Accéder', ar: 'الدخول', en: 'Access', es: 'Acceder', pt: 'Acessar', tr: 'Eriş' })}</span>
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </div>
    </motion.button>
  );

  return (
    <div className="w-full p-4 md:p-6 space-y-6">
      
      {/* HEADER WITH NAVIGATION */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            {currentView === 'menu' ? (
              <>
                <h1 className="text-2xl font-bold text-slate-800">{tx(lang, { fr: 'Paramètres & Configuration', ar: 'الإعدادات والتكوين', en: 'Settings & Configuration', es: 'Ajustes & Configuración', pt: 'Configurações & Definições', tr: 'Ayarlar & Yapılandırma' })}</h1>
                <p className="text-slate-500 text-sm mt-1">{tx(lang, { fr: 'Gestion du parc machines et des standards de temps', ar: 'إدارة أسطول الماكينات ومعايير الوقت', en: 'Machine fleet and time standards management', es: 'Gestión del parque de máquinas y estándares de tiempo', pt: 'Gestão do parque de máquinas e padrões de tempo', tr: 'Makine filosu ve zaman standartları yönetimi' })}</p>
              </>
            ) : (
              <div className="flex items-center gap-3">
                 <button 
                   onClick={() => setCurrentView('menu')}
                   className="w-10 h-10 rounded-xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-slate-500 flex items-center justify-center hover:bg-slate-50 dark:bg-dk-elevated hover:text-slate-800 transition-colors"
                 >
                   <ChevronLeft className="w-6 h-6" />
                 </button>
                 <div>
                   <h1 className="text-2xl font-bold text-slate-800">
                      {currentView === 'machines' && tx(lang, { fr: 'Parc Machines', ar: 'أسطول الماكينات', en: 'Machine Fleet', es: 'Parque de Máquinas', pt: 'Parque de Máquinas', tr: 'Makine Filosu' })}
                      {currentView === 'standards' && tx(lang, { fr: 'Standards & Temps', ar: 'المعايير والأوقات', en: 'Standards & Times', es: 'Estándares & Tiempos', pt: 'Padrões & Tempos', tr: 'Standartlar & Süreler' })}
                      {currentView === 'guides' && tx(lang, { fr: 'Guides & Accessoires', ar: 'الأدلة والملحقات', en: 'Guides & Accessories', es: 'Guías & Accesorios', pt: 'Guias & Acessórios', tr: 'Kılavuzlar & Aksesuarlar' })}
                      {currentView === 'fil' && tx(lang, { fr: 'Consommation Fil Couture', ar: 'استهلاك خيط الخياطة', en: 'Sewing Thread Consumption', es: 'Consumo de Hilo de Costura', pt: 'Consumo de Linha de Costura', tr: 'Dikiş İpliği Tüketimi' })}
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                      {currentView === 'machines' && tx(lang, { fr: 'Liste complète et configuration des machines', ar: 'القائمة الكاملة وتكوين الماكينات', en: 'Full list and machine configuration', es: 'Lista completa y configuración de máquinas', pt: 'Lista completa e configuração de máquinas', tr: 'Tam liste ve makine yapılandırması' })}
                      {currentView === 'standards' && tx(lang, { fr: 'Coefficients de majoration et temps prédéfinis', ar: 'معاملات الزيادة والأوقات المحددة مسبقاً', en: 'Surcharge coefficients and predefined times', es: 'Coeficientes de recargo y tiempos predefinidos', pt: 'Coeficientes de majoração e tempos predefinidos', tr: 'Zam katsayıları ve önceden tanımlı süreler' })}
                      {currentView === 'guides' && tx(lang, { fr: 'Pieds de biche, guides et attachements spéciaux', ar: 'أقدام الضغط والأدلة والملحقات الخاصة', en: 'Presser feet, guides and special attachments', es: 'Prensatelas, guías y accesorios especiales', pt: 'Pés calcadores, guias e acessórios especiais', tr: 'Basit ayağı, kılavuzlar ve özel aparatlar' })}
                      {currentView === 'fil' && tx(lang, { fr: 'Tableau de référence des coefficients de consommation par type de point', ar: 'جدول مرجعي لمعاملات الاستهلاك حسب نوع الغرزة', en: 'Reference table of consumption coefficients by stitch type', es: 'Tabla de referencia de coeficientes de consumo por tipo de puntada', pt: 'Tabela de referência de coeficientes de consumo por tipo de ponto', tr: 'Dikiş tipine göre tüketim katsayıları referans tablosu' })}
                    </p>
                 </div>
              </div>
            )}
          </div>

          {/* Autocomplete Toggle */}
          {currentView === 'menu' && setIsAutocompleteEnabled && (
              <div className="bg-white dark:bg-dk-surface px-4 py-2 rounded-xl border border-slate-200 dark:border-dk-border shadow-sm flex items-center gap-4">
                  <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1"><Type className="w-3 h-3 text-indigo-500" /> {tx(lang, { fr: 'Autocomplétion', ar: 'الإكمال التلقائي', en: 'Autocomplete', es: 'Autocompletado', pt: 'Autocompletar', tr: 'Otomatik Tamamlama' })}</span>
                      <span className="text-[10px] text-slate-400">{tx(lang, { fr: 'Suggestions intelligentes', ar: 'اقتراحات ذكية', en: 'Smart suggestions', es: 'Sugerencias inteligentes', pt: 'Sugestões inteligentes', tr: 'Akıllı öneriler' })}</span>
                  </div>
                  <button 
                      onClick={() => setIsAutocompleteEnabled(prev => !prev)}
                      className={`w-10 h-5 rounded-full p-1 transition-colors relative flex items-center ${isAutocompleteEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                      <div className={`w-3 h-3 bg-white dark:bg-dk-surface rounded-full shadow-sm transition-transform duration-300 ${isAutocompleteEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
              </div>
          )}
        </div>
      </div>

      {/* === VIEW: MENU (DASHBOARD) === */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          {currentView === 'menu' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4 max-w-5xl mx-auto">
              <MenuCard 
                title={tx(lang, { fr: 'Parc Machines', ar: 'أسطول الماكينات', en: 'Machine Fleet', es: 'Parque de Máquinas', pt: 'Parque de Máquinas', tr: 'Makine Filosu' })}
                desc={tx(lang, { fr: 'Gérez votre liste de machines, vitesses, classes et coefficients de majoration.', ar: 'إدارة قائمة الماكينات والسرعات والطبقات ومعاملات الزيادة', en: 'Manage your machine list, speeds, classes and surcharge coefficients.', es: 'Gestione su lista de máquinas, velocidades, clases y coeficientes de recargo.', pt: 'Gerencie sua lista de máquinas, velocidades, classes e coeficientes de majoração.', tr: 'Makine listenizi, hızlarınızı, sınıflarınızı ve zam katsayılarınızı yönetin.' })}
                icon={Scissors}
                bgClass="bg-emerald-50"
                colorClass="text-emerald-600"
                onClick={() => setCurrentView('machines')}
              />
              <MenuCard 
                title={tx(lang, { fr: 'Standards & Temps', ar: 'المعايير والأوقات', en: 'Standards & Times', es: 'Estándares & Tiempos', pt: 'Padrões & Tempos', tr: 'Standartlar & Süreler' })}
                desc={tx(lang, { fr: 'Configurez les temps standards, les facteurs de complexité et les vitesses.', ar: 'تكوين الأوقات القياسية وعوامل التعقيد والسرعات', en: 'Configure standard times, complexity factors and speeds.', es: 'Configure los tiempos estándar, factores de complejidad y velocidades.', pt: 'Configure os tempos padrão, fatores de complexidade e velocidades.', tr: 'Standart süreleri, karmaşıklık faktörlerini ve hızları yapılandırın.' })}
                icon={Settings}
                bgClass="bg-indigo-50"
                colorClass="text-indigo-600"
                onClick={() => setCurrentView('standards')}
              />
              <MenuCard 
                title={tx(lang, { fr: 'Guides & Accessoires', ar: 'الأدلة والملحقات', en: 'Guides & Accessories', es: 'Guías & Accesorios', pt: 'Guias & Acessórios', tr: 'Kılavuzlar & Aksesuarlar' })}
                desc={tx(lang, { fr: 'Base de données des pieds de biche, guides et outils d\'aide à la confection.', ar: 'قاعدة بيانات أقدام الضغط والأدلة وأدوات المساعدة على الخياطة', en: 'Database of presser feet, guides and sewing aids.', es: 'Base de datos de prensatelas, guías y herramientas de ayuda a la confección.', pt: 'Base de dados de pés calcadores, guias e ferramentas de auxílio à confecção.', tr: 'Basit ayağı, kılavuzlar ve dikiş yardımcı araçları veritabanı.' })}
                icon={Layers}
                bgClass="bg-orange-50"
                colorClass="text-orange-600"
                onClick={() => setCurrentView('guides')}
              />
              <MenuCard 
                title={tx(lang, { fr: 'Consommation Fil Couture', ar: 'استهلاك خيط الخياطة', en: 'Sewing Thread Consumption', es: 'Consumo de Hilo de Costura', pt: 'Consumo de Linha de Costura', tr: 'Dikiş İpliği Tüketimi' })}
                desc={tx(lang, { fr: 'Tableau de référence des coefficients de consommation de fil par type de point et machine.', ar: 'جدول مرجعي لمعاملات استهلاك الخيط حسب نوع الغرزة والماكينة', en: 'Reference table of thread consumption coefficients by stitch type and machine.', es: 'Tabla de referencia de coeficientes de consumo de hilo por tipo de puntada y máquina.', pt: 'Tabela de referência de coeficientes de consumo de linha por tipo de ponto e máquina.', tr: 'Dikiş tipine ve makineye göre iplik tüketim katsayıları referans tablosu.' })}
                icon={Component}
                bgClass="bg-purple-50"
                colorClass="text-purple-600"
                onClick={() => setCurrentView('fil')}
              />
            </div>
          )}

          {/* ... Other Views ... */}
          {currentView === 'machines' && (
            <div className="space-y-6">
              {/* Existing Machine View Content */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-3 bg-white dark:bg-dk-surface p-2 rounded-xl border border-slate-200 dark:border-dk-border shadow-sm flex items-center gap-3 px-4">
                  <Search className="w-5 h-5 text-slate-400 shrink-0" />
                  <input 
                    type="text" 
                    placeholder={tx(lang, { fr: 'Rechercher par nom ou classe...', ar: 'البحث بالاسم أو الطبقة...', en: 'Search by name or class...', es: 'Buscar por nombre o clase...', pt: 'Pesquisar por nome ou classe...', tr: 'Ada veya sınıfa göre ara...' })}
                    className="flex-1 bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400 h-10 w-full min-w-0"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button 
                  type="button"
                  onClick={() => openMachineModal()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 rounded-xl font-medium shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center justify-center gap-2 h-14 lg:h-auto"
                >
                  <Plus className="w-5 h-5" />
                  <span>{tx(lang, { fr: 'Ajouter Machine', ar: 'إضافة ماكينة', en: 'Add Machine', es: 'Añadir Máquina', pt: 'Adicionar Máquina', tr: 'Makine Ekle' })}</span>
                </button>
              </div>

              <div className="hidden sm:block bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-dk-elevated/80 border-b border-slate-100 dark:border-dk-border/60">
                        <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">{tx(lang, { fr: 'Machine', ar: 'الماكينة', en: 'Machine', es: 'Máquina', pt: 'Máquina', tr: 'Makine' })}</th>
                        <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">{tx(lang, { fr: 'Type', ar: 'النوع', en: 'Type', es: 'Tipo', pt: 'Tipo', tr: 'Tip' })}</th>
                        <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">{tx(lang, { fr: 'Classe', ar: 'الطبقة', en: 'Class', es: 'Clase', pt: 'Classe', tr: 'Sınıf' })}</th>
                        <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">{tx(lang, { fr: 'Vitesse', ar: 'السرعة', en: 'Speed', es: 'Velocidad', pt: 'Velocidade', tr: 'Hız' })}</th>
                        <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">{tx(lang, { fr: 'Majoration', ar: 'الزيادة', en: 'Surcharge', es: 'Recargo', pt: 'Majoração', tr: 'Zam' })}</th>
                        <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">COFS</th>
                        <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">{tx(lang, { fr: 'État', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Estado', tr: 'Durum' })}</th>
                        <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-right">{tx(lang, { fr: 'Actions', ar: 'الإجراءات', en: 'Actions', es: 'Acciones', pt: 'Ações', tr: 'İşlemler' })}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMachines.map((machine) => (
                        <tr key={machine.id} className={`group transition-colors hover:bg-slate-50 dark:bg-dk-elevated/80 ${!machine.active ? 'opacity-60 bg-slate-50 dark:bg-dk-elevated/50' : ''}`}>
                          <td className="py-2.5 px-4"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${machine.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><Scissors className="w-4 h-4" /></div><span className="font-semibold text-slate-700 text-sm">{machine.name}</span></div></td>
                          <td className="py-2.5 px-4 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:border-dk-border">{machine.machineCategory || '—'}</span></td>
                          <td className="py-2.5 px-4 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:border-dk-border">{machine.classe}</span></td>
                          <td className="py-2.5 px-4 text-center text-slate-600 font-mono text-sm">{machine.speed}</td>
                          <td className="py-2.5 px-4 text-center text-slate-600 font-mono text-sm">{machine.speedMajor}</td>
                          <td className="py-2.5 px-4 text-center"><span className="font-bold text-slate-700 text-sm">{machine.cofs}</span></td>
                          <td className="py-2.5 px-4 text-center"><button onClick={() => onToggleMachine(machine.id)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${machine.active ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`inline-block h-3 w-3 transform rounded-full bg-white dark:bg-dk-surface transition-transform ${machine.active ? 'translate-x-5' : 'translate-x-1'}`} /></button></td>
                          <td className="py-2.5 px-4 text-right"><div className="flex items-center justify-end gap-1"><button onClick={() => openMachineModal(machine)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button><button onClick={() => setDeleteData({ type: 'machine', id: machine.id })} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          
          {/* ... Standards View ... */}
          {currentView === 'standards' && (
            <div className="space-y-8">
              {/* Facteurs de complexité */}
              <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-dk-border/60 flex justify-between items-center bg-slate-50 dark:bg-dk-elevated/50">
                  <div>
                    <h3 className="font-bold text-slate-800">{tx(lang, { fr: 'Facteurs de Guide (Complexité)', ar: 'عوامل الدليل (التعقيد)', en: 'Guide Factors (Complexity)', es: 'Factores de Guía (Complejidad)', pt: 'Fatores de Guia (Complexidade)', tr: 'Kılavuz Faktörleri (Karmaşıklık)' })}</h3>
                    <p className="text-xs text-slate-500">{tx(lang, { fr: 'Coefficients appliqués selon la difficulté de manipulation.', ar: 'معاملات تُطبق حسب صعوبة التشغيل', en: 'Coefficients applied according to handling difficulty.', es: 'Coeficientes aplicados según la dificultad de manipulación.', pt: 'Coeficientes aplicados conforme a dificuldade de manipulação.', tr: 'Kullanım zorluğuna göre uygulanan katsayılar.' })}</p>
                  </div>
                  <button onClick={() => openComplexityModal()} className="p-2 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-dk-elevated text-[10px] uppercase font-bold text-slate-500">
                      <tr>
                        <th className="py-3 px-6">{tx(lang, { fr: 'Description', ar: 'الوصف', en: 'Description', es: 'Descripción', pt: 'Descrição', tr: 'Açıklama' })}</th>
                        <th className="py-3 px-6 text-center">{tx(lang, { fr: 'Majoration', ar: 'الزيادة', en: 'Surcharge', es: 'Recargo', pt: 'Majoração', tr: 'Zam' })}</th>
                        <th className="py-3 px-6 text-right">{tx(lang, { fr: 'Actions', ar: 'الإجراءات', en: 'Actions', es: 'Acciones', pt: 'Ações', tr: 'İşlemler' })}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {complexityFactors.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50 dark:bg-dk-elevated transition-colors">
                          <td className="py-3 px-6 font-medium text-slate-700">{item.label}</td>
                          <td className="py-3 px-6 text-center"><span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md font-bold">{item.value}</span></td>
                          <td className="py-3 px-6 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => openComplexityModal(item)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setDeleteData({type: 'complexity', id: item.id})} className="p-1.5 text-slate-400 hover:text-rose-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Facteurs de vitesse */}
              <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-dk-border/60 flex justify-between items-center bg-slate-50 dark:bg-dk-elevated/50">
                  <div>
                    <h3 className="font-bold text-slate-800">{tx(lang, { fr: 'Facteurs de Vitesse (RPM)', ar: 'عوامل السرعة (RPM)', en: 'Speed Factors (RPM)', es: 'Factores de Velocidad (RPM)', pt: 'Fatores de Velocidade (RPM)', tr: 'Hız Faktörleri (RPM)' })}</h3>
                    <p className="text-xs text-slate-500">{tx(lang, { fr: 'Ajustements automatiques selon la vitesse machine.', ar: 'تعديلات تلقائية حسب سرعة الماكينة', en: 'Automatic adjustments based on machine speed.', es: 'Ajustes automáticos según la velocidad de la máquina.', pt: 'Ajustes automáticos conforme a velocidade da máquina.', tr: 'Makine hızına göre otomatik ayarlamalar.' })}</p>
                  </div>
                  <button onClick={() => openSpeedModal()} className="p-2 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg hover:border-emerald-300 hover:text-emerald-600 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-dk-elevated text-[10px] uppercase font-bold text-slate-500">
                      <tr>
                        <th className="py-3 px-6">{tx(lang, { fr: 'Plage (RPM)', ar: 'النطاق (RPM)', en: 'Range (RPM)', es: 'Rango (RPM)', pt: 'Faixa (RPM)', tr: 'Aralık (RPM)' })}</th>
                        <th className="py-3 px-6 text-center">{tx(lang, { fr: 'Majoration', ar: 'الزيادة', en: 'Surcharge', es: 'Recargo', pt: 'Majoração', tr: 'Zam' })}</th>
                        <th className="py-3 px-6 text-right">{tx(lang, { fr: 'Actions', ar: 'الإجراءات', en: 'Actions', es: 'Acciones', pt: 'Ações', tr: 'İşlemler' })}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {speedFactors.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50 dark:bg-dk-elevated transition-colors">
                          <td className="py-3 px-6 font-medium text-slate-700">{item.min} - {item.max} tr/min</td>
                          <td className="py-3 px-6 text-center"><span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md font-bold">{item.value}</span></td>
                          <td className="py-3 px-6 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => openSpeedModal(item)} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setDeleteData({type: 'speed', id: item.id})} className="p-1.5 text-slate-400 hover:text-rose-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Temps standards */}
              <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-dk-border/60 flex justify-between items-center bg-slate-50 dark:bg-dk-elevated/50">
                  <div>
                    <h3 className="font-bold text-slate-800">{tx(lang, { fr: 'Temps Standards & Fréquences', ar: 'الأوقات القياسية والتكرارات', en: 'Standard Times & Frequencies', es: 'Tiempos Estándar & Frecuencias', pt: 'Tempos Padrão & Frequências', tr: 'Standart Süreler & Frekanslar' })}</h3>
                    <p className="text-xs text-slate-500">{tx(lang, { fr: 'Valeurs prédéfinies pour opérations courantes.', ar: 'قيم محددة مسبقاً للعمليات الشائعة', en: 'Preset values for common operations.', es: 'Valores predefinidos para operaciones comunes.', pt: 'Valores predefinidos para operações comuns.', tr: 'Yaygın işlemler için önceden tanımlanmış değerler.' })}</p>
                  </div>
                  <button onClick={() => openTimeModal()} className="p-2 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg hover:border-amber-300 hover:text-amber-600 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-dk-elevated text-[10px] uppercase font-bold text-slate-500">
                      <tr>
                        <th className="py-3 px-6">{tx(lang, { fr: 'Opération / Tâche', ar: 'العملية / المهمة', en: 'Operation / Task', es: 'Operación / Tarea', pt: 'Operação / Tarefa', tr: 'İşlem / Görev' })}</th>
                        <th className="py-3 px-6 text-center">{tx(lang, { fr: 'Valeur', ar: 'القيمة', en: 'Value', es: 'Valor', pt: 'Valor', tr: 'Değer' })}</th>
                        <th className="py-3 px-6 text-right">{tx(lang, { fr: 'Actions', ar: 'الإجراءات', en: 'Actions', es: 'Acciones', pt: 'Ações', tr: 'İşlemler' })}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {standardTimes.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50 dark:bg-dk-elevated transition-colors">
                          <td className="py-3 px-6 font-medium text-slate-700">{item.label}</td>
                          <td className="py-3 px-6 text-center">
                            <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md font-bold font-mono">
                              {item.value} <span className="text-[10px] opacity-70 uppercase">{item.unit}</span>
                            </span>
                          </td>
                          <td className="py-3 px-6 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => openTimeModal(item)} className="p-1.5 text-slate-400 hover:text-amber-600 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setDeleteData({type: 'time', id: item.id})} className="p-1.5 text-slate-400 hover:text-rose-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ... Guides View ... */}
          {currentView === 'guides' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-3 bg-white dark:bg-dk-surface p-2 rounded-xl border border-slate-200 dark:border-dk-border shadow-sm flex items-center gap-3 px-4">
                  <Search className="w-5 h-5 text-slate-400 shrink-0" />
                  <input 
                    type="text" 
                    placeholder={tx(lang, { fr: 'Rechercher un guide, un pied, une machine...', ar: 'البحث عن دليل أو قدم أو ماكينة...', en: 'Search for a guide, foot, machine...', es: 'Buscar una guía, un pie, una máquina...', pt: 'Pesquisar um guia, um pé, uma máquina...', tr: 'Bir kılavuz, ayak, makine ara...' })}
                    className="flex-1 bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400 h-10 w-full min-w-0"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button 
                  onClick={() => openGuideModal()}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-5 rounded-xl font-medium shadow-lg shadow-orange-100 transition-all active:scale-95 flex items-center justify-center gap-2 h-14 lg:h-auto"
                >
                  <Plus className="w-5 h-5" />
                  <span>{tx(lang, { fr: 'Ajouter Guide', ar: 'إضافة دليل', en: 'Add Guide', es: 'Añadir Guía', pt: 'Adicionar Guia', tr: 'Kılavuz Ekle' })}</span>
                </button>
              </div>
              
              {/* Grouped Guides List */}
              {Object.keys(groupedGuides).length > 0 ? (
                Object.entries(groupedGuides).map(([group, items]: [string, Guide[]]) => {
                    const matchingMachine = machines.find(m => group.toLowerCase().includes((m.name || '').toLowerCase()));
                    const displayGroup = matchingMachine && !group.includes(matchingMachine.classe) 
                        ? `${group} (${matchingMachine.classe})` 
                        : group;
                    return (
                    <div key={group} className="space-y-3">
                        <div className="flex items-center gap-2 px-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{displayGroup}</span>
                            <div className="h-px bg-slate-200 flex-1"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {items.map((guide: Guide) => (
                                <div key={guide.id} className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border p-4 shadow-sm hover:shadow-md transition-all group relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                                                <Layers className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-700 text-sm leading-tight">{guide.name}</h4>
                                                <span className="text-[10px] text-slate-400 font-medium">{guide.category}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openGuideModal(guide)} className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => setDeleteData({type: 'guide', id: guide.id})} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 mb-3 line-clamp-2 min-h-[2.5em]">
                                        {guide.description || tx(lang, { fr: 'Aucune description.', ar: 'لا يوجد وصف', en: 'No description.', es: 'Sin descripción.', pt: 'Nenhuma descrição.', tr: 'Açıklama yok.' })}
                                    </p>
                                    {guide.useCase && (
                                        <div className="mt-auto pt-3 border-t border-slate-50 flex items-center gap-1.5 text-[10px] text-slate-400">
                                            <Info className="w-3 h-3" />
                                            <span className="italic truncate">{guide.useCase}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )})
              ) : (
                <div className="text-center py-20 bg-white dark:bg-dk-surface rounded-3xl border border-dashed border-slate-300">
                    <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <h3 className="text-slate-500 font-bold">{tx(lang, { fr: 'Aucun guide trouvé', ar: 'لم يتم العثور على أي دليل', en: 'No guide found', es: 'Ninguna guía encontrada', pt: 'Nenhum guia encontrado', tr: 'Kılavuz bulunamadı' })}</h3>
                    <p className="text-slate-400 text-sm">{tx(lang, { fr: 'Ajoutez des guides pour enrichir votre base de données.', ar: 'أضف أدلة لإثراء قاعدة بياناتك', en: 'Add guides to enrich your database.', es: 'Añada guías para enriquecer su base de datos.', pt: 'Adicione guias para enriquecer sua base de dados.', tr: 'Veritabanınızı zenginleştirmek için kılavuzlar ekleyin.' })}</p>
                </div>
              )}
            </div>
          )}

          {/* === CONSOMMATION FIL VIEW === */}
          {currentView === 'fil' && (
            <div className="space-y-6">
              {/* Action Bar */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <button
                  onClick={() => setCurrentView('menu')}
                  className="flex items-center gap-2 px-4 py-2.5 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> {tx(lang, { fr: 'Retour', ar: 'العودة', en: 'Back', es: 'Volver', pt: 'Voltar', tr: 'Geri' })}
                </button>
                <div className="flex items-center gap-3">
                  {filHasChanges && (
                    <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                      {tx(lang, { fr: 'Modifications non sauvegardées', ar: 'تعديلات غير محفوظة', en: 'Unsaved changes', es: 'Cambios no guardados', pt: 'Alterações não salvas', tr: 'Kaydedilmemiş değişiklikler' })}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setFilForm({ code: '', name: '', nameAr: '', isoNumber: 0, threadCount: 1, consumptionFactor: 0, machineCode: '', observations: '' });
                      setFilEditIndex(-1);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-200"
                  >
                    <Plus className="w-4 h-4" /> {tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Añadir', pt: 'Adicionar', tr: 'Ekle' })}
                  </button>
                  <button
                    onClick={() => setFilResetConfirmOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 text-slate-600 font-bold rounded-xl border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:bg-dk-elevated transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" /> {tx(lang, { fr: 'Réinitialiser', ar: 'إعادة تعيين', en: 'Reset', es: 'Restablecer', pt: 'Redefinir', tr: 'Sıfırla' })}
                  </button>
                  <button
                    onClick={() => setFilConfirmOpen(true)}
                    disabled={!filHasChanges}
                    className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-purple-200"
                  >
                    <CheckCircle2 className="w-4 h-4" /> {tx(lang, { fr: 'Confirmer', ar: 'تأكيد', en: 'Confirm', es: 'Confirmar', pt: 'Confirmar', tr: 'Onayla' })}
                  </button>
                </div>
              </div>

              {/* Info Banner */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Info className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h4 className="font-bold text-purple-800 text-sm">{tx(lang, { fr: 'Formule de calcul', ar: 'معادلة الحساب', en: 'Calculation formula', es: 'Fórmula de cálculo', pt: 'Fórmula de cálculo', tr: 'Hesaplama formülü' })}</h4>
                  <p className="text-purple-600 text-xs mt-1">
                    <span className="font-mono bg-purple-100 px-1.5 py-0.5 rounded">{tx(lang, { fr: 'Consommation (m) = Longueur couture (m) × Coefficient', ar: 'الاستهلاك (م) = طول الخياطة (م) × المعامل', en: 'Consumption (m) = Seam length (m) × Coefficient', es: 'Consumo (m) = Longitud de costura (m) × Coeficiente', pt: 'Consumo (m) = Comprimento da costura (m) × Coeficiente', tr: 'Tüketim (m) = Dikiş uzunluğu (m) × Katsayı' })}</span>
                  </p>
                  <p className="text-purple-500 text-xs mt-1">
                    {tx(lang, { fr: 'Cliquez sur une ligne pour modifier le coefficient. Puis cliquez <strong>Confirmer</strong> pour sauvegarder.', ar: 'انقر على سطر لتعديل المعامل. ثم انقر <strong>تأكيد</strong> للحفظ.', en: 'Click a row to edit the coefficient. Then click <strong>Confirm</strong> to save.', es: 'Haga clic en una línea para modificar el coeficiente. Luego haga clic en <strong>Confirmar</strong> para guardar.', pt: 'Clique numa linha para modificar o coeficiente. Depois clique em <strong>Confirmar</strong> para guardar.', tr: 'Katsayıyı düzenlemek için bir satıra tıklayın. Ardından kaydetmek için <strong>Onayla</strong>\'ya tıklayın.' })}</p>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-dk-elevated border-b border-slate-200 dark:border-dk-border">
                      <tr>
                        <th className="p-3 text-left text-xs font-bold text-slate-500 uppercase">{tx(lang, { fr: 'Type de point', ar: 'نوع الغرزة', en: 'Stitch type', es: 'Tipo de puntada', pt: 'Tipo de ponto', tr: 'Dikiş tipi' })}</th>
                        <th className="p-3 text-center text-xs font-bold text-slate-500 uppercase">{tx(lang, { fr: 'N° ISO', ar: 'N° ISO', en: 'N° ISO', es: 'N° ISO', pt: 'N° ISO', tr: 'N° ISO' })}</th>
                        <th className="p-3 text-center text-xs font-bold text-slate-500 uppercase">{tx(lang, { fr: 'Nb fils', ar: 'عدد الخيوط', en: 'Threads', es: 'Nº hilos', pt: 'Nº fios', tr: 'İplik sayısı' })}</th>
                        <th className="p-3 text-center text-xs font-bold text-purple-600 uppercase">{tx(lang, { fr: 'Conso / m', ar: 'الاستهلاك / م', en: 'Cons. / m', es: 'Cons. / m', pt: 'Cons. / m', tr: 'Tük. / m' })}</th>
                        <th className="p-3 text-left text-xs font-bold text-slate-500 uppercase">{tx(lang, { fr: 'Machine', ar: 'الماكينة', en: 'Machine', es: 'Máquina', pt: 'Máquina', tr: 'Makine' })}</th>
                        <th className="p-3 text-left text-xs font-bold text-slate-500 uppercase">{tx(lang, { fr: 'Observations', ar: 'ملاحظات', en: 'Observations', es: 'Observaciones', pt: 'Observações', tr: 'Gözlemler' })}</th>
                        <th className="p-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filTypes.map((stitch, idx) => (
                        <tr
                          key={idx}
                          onClick={() => openFilEdit(idx)}
                          className="hover:bg-purple-50/50 cursor-pointer transition-colors"
                        >
                          <td className="p-3 font-bold text-slate-700">{stitch.name}</td>
                          <td className="p-3 text-center">
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono font-bold">
                              {stitch.isoNumber}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">
                              {stitch.threadCount}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold font-mono">
                              {stitch.consumptionFactor}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-mono">
                              {stitch.machineCode || '—'}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-slate-500 max-w-[200px] truncate">
                            {stitch.observations || '—'}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={(e) => { e.stopPropagation(); openFilEdit(idx); }}
                              className="p-1.5 text-purple-400 hover:text-purple-700 hover:bg-purple-100 rounded-lg transition-colors"
                              title={tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' })}
                            >
                              <Edit2 className="w-4 h-4" />
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
        </motion.div>
      </AnimatePresence>

      {/* === MODALS === */}
      {modalType && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-md" onClick={closeModal} />
          <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200 dark:border-dk-border/70">
            <div className="bg-slate-50 dark:bg-dk-elevated px-6 py-4 border-b border-slate-100 dark:border-dk-border/60 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                {editingItem ? <Edit2 className="w-4 h-4 text-emerald-600" /> : <Plus className="w-4 h-4 text-emerald-600" />}
                {editingItem ? tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' }) : tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Añadir', pt: 'Adicionar', tr: 'Ekle' })}
                {modalType === 'machine' && tx(lang, { fr: ' Machine', ar: ' ماكينة', en: ' Machine', es: ' Máquina', pt: ' Máquina', tr: ' Makine' })}
                {modalType === 'speed' && tx(lang, { fr: ' Facteur Vitesse', ar: ' عامل سرعة', en: ' Speed Factor', es: ' Factor Velocidad', pt: ' Fator Velocidade', tr: ' Hız Faktörü' })}
                {modalType === 'complexity' && tx(lang, { fr: ' Facteur Guide', ar: ' عامل دليل', en: ' Guide Factor', es: ' Factor Guía', pt: ' Fator Guia', tr: ' Kılavuz Faktörü' })}
                {modalType === 'time' && tx(lang, { fr: ' Temps Standard', ar: ' وقت قياسي', en: ' Standard Time', es: ' Tiempo Estándar', pt: ' Tempo Padrão', tr: ' Standart Süre' })}
                {modalType === 'guide' && tx(lang, { fr: ' Guide / Accessoire', ar: ' دليل / ملحق', en: ' Guide / Accessory', es: ' Guía / Accesorio', pt: ' Guia / Acessório', tr: ' Kılavuz / Aksesuar' })}
              </h3>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
                {modalType === 'machine' && (
                <form onSubmit={saveMachine} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'Ad' })}</label>
                    <input
                      type="text"
                      value={machineForm.name}
                      onChange={e => {
                        setMachineForm({...machineForm, name: e.target.value});
                        if (machineErrors.name) setMachineErrors(prev => ({ ...prev, name: false }));
                      }}
                      className={`w-full rounded-xl px-3 py-2.5 text-slate-700 outline-none transition-all ${machineErrors.name ? 'bg-rose-50 border border-rose-300 focus:border-rose-500' : 'bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border focus:border-emerald-500'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Type (Famille)', ar: 'النوع (العائلة)', en: 'Type (Family)', es: 'Tipo (Familia)', pt: 'Tipo (Família)', tr: 'Tip (Aile)' })}</label>
                    <input
                      type="text"
                      value={machineForm.machineCategory || ''}
                      onChange={e => setMachineForm({...machineForm, machineCategory: e.target.value})}
                      className="w-full rounded-xl px-3 py-2.5 text-slate-700 outline-none transition-all bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border focus:border-emerald-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Classe', ar: 'الطبقة', en: 'Class', es: 'Clase', pt: 'Classe', tr: 'Sınıf' })}</label>
                      <input
                        type="text"
                        value={machineForm.classe}
                        onChange={e => {
                          setMachineForm({...machineForm, classe: e.target.value});
                          if (machineErrors.classe) setMachineErrors(prev => ({ ...prev, classe: false }));
                        }}
                        className={`w-full rounded-xl px-3 py-2.5 text-slate-700 outline-none transition-all ${machineErrors.classe ? 'bg-rose-50 border border-rose-300 focus:border-rose-500' : 'bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border focus:border-emerald-500'}`}
                      />
                    </div>
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Vitesse', ar: 'السرعة', en: 'Speed', es: 'Velocidad', pt: 'Velocidade', tr: 'Hız' })}</label><input type="number" required value={machineForm.speed} onChange={e => setMachineForm({...machineForm, speed: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                  </div>
                  {(machineErrors.name || machineErrors.classe) && (
                    <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                      {tx(lang, { fr: 'Remplissez les champs obligatoires en rouge avant d\'enregistrer.', ar: 'املأ الحقول الإلزامية باللون الأحمر قبل الحفظ', en: 'Fill in the required fields in red before saving.', es: 'Rellene los campos obligatorios en rojo antes de guardar.', pt: 'Preencha os campos obrigatórios a vermelho antes de guardar.', tr: 'Kaydetmeden önce kırmızı renkteki zorunlu alanları doldurun.' })}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Majoration', ar: 'الزيادة', en: 'Surcharge', es: 'Recargo', pt: 'Majoração', tr: 'Zam' })}</label><input type="number" step="0.01" required value={machineForm.speedMajor} onChange={e => setMachineForm({...machineForm, speedMajor: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">COFS</label><input type="number" step="0.01" required value={machineForm.cofs} onChange={e => setMachineForm({...machineForm, cofs: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                  </div>
                  <button type="submit" className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all mt-2">{tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}</button>
                </form>
              )}
              {modalType === 'speed' && (
                <form onSubmit={saveSpeed} className="space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Min', ar: 'الحد الأدنى', en: 'Min', es: 'Mín', pt: 'Mín', tr: 'Min' })}</label><input type="number" required value={speedForm.min} onChange={e => setSpeedForm({...speedForm, min: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Max', ar: 'الحد الأقصى', en: 'Max', es: 'Máx', pt: 'Máx', tr: 'Maks' })}</label><input type="number" required value={speedForm.max} onChange={e => setSpeedForm({...speedForm, max: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                  </div>
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Majoration', ar: 'الزيادة', en: 'Surcharge', es: 'Recargo', pt: 'Majoração', tr: 'Zam' })}</label><input type="number" step="0.01" required value={speedForm.value} onChange={e => setSpeedForm({...speedForm, value: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                  <button type="submit" className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all mt-2">{tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}</button>
                </form>
              )}
              {modalType === 'complexity' && (
                <form onSubmit={saveComplexity} className="space-y-4">
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Description', ar: 'الوصف', en: 'Description', es: 'Descripción', pt: 'Descrição', tr: 'Açıklama' })}</label><input type="text" required value={complexityForm.label} onChange={e => setComplexityForm({...complexityForm, label: e.target.value})} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-indigo-500 transition-all" /></div>
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Majoration', ar: 'الزيادة', en: 'Surcharge', es: 'Recargo', pt: 'Majoração', tr: 'Zam' })}</label><input type="number" step="0.01" required value={complexityForm.value} onChange={e => setComplexityForm({...complexityForm, value: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-indigo-500 transition-all" /></div>
                  <button type="submit" className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all mt-2">{tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}</button>
                </form>
              )}
              {modalType === 'time' && (
                <form onSubmit={saveTime} className="space-y-4">
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Opération', ar: 'العملية', en: 'Operation', es: 'Operación', pt: 'Operação', tr: 'İşlem' })}</label><input type="text" required value={timeForm.label} onChange={e => setTimeForm({...timeForm, label: e.target.value})} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-amber-500 transition-all" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Valeur', ar: 'القيمة', en: 'Value', es: 'Valor', pt: 'Valor', tr: 'Değer' })}</label><input type="number" step="0.001" required value={timeForm.value} onChange={e => setTimeForm({...timeForm, value: Number(e.target.value)})} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-amber-500 transition-all" /></div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Unité', ar: 'الوحدة', en: 'Unit', es: 'Unidad', pt: 'Unidade', tr: 'Birim' })}</label>
                      <select value={timeForm.unit} onChange={e => setTimeForm({...timeForm, unit: e.target.value as 'min'|'sec'})} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-amber-500 transition-all">
                        <option value="min">{tx(lang, { fr: 'Minute (min)', ar: 'دقيقة (min)', en: 'Minute (min)', es: 'Minuto (min)', pt: 'Minuto (min)', tr: 'Dakika (min)' })}</option>
                        <option value="sec">{tx(lang, { fr: 'Seconde (s)', ar: 'ثانية (s)', en: 'Second (s)', es: 'Segundo (s)', pt: 'Segundo (s)', tr: 'Saniye (s)' })}</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="w-full py-2.5 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700 shadow-lg shadow-amber-200 transition-all mt-2">{tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}</button>
                </form>
              )}
              {modalType === 'guide' && (
                <form onSubmit={saveGuide} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'Ad' })}</label>
                    <input
                      type="text"
                      value={guideForm.name}
                      onChange={e => {
                        setGuideForm({...guideForm, name: e.target.value});
                        if (guideErrors.name) setGuideErrors(prev => ({ ...prev, name: false }));
                      }}
                      placeholder={tx(lang, { fr: 'Ex: Pied Téflon', ar: 'مثال: قدم تفلونية', en: 'Ex: Teflon Foot', es: 'Ej: Pie de Teflón', pt: 'Ex: Pé de Teflon', tr: 'Örn: Teflon Ayak' })}
                      className={`w-full rounded-xl px-3 py-2.5 text-slate-700 outline-none transition-all ${guideErrors.name ? 'bg-rose-50 border border-rose-300 focus:border-rose-500' : 'bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border focus:border-orange-500'}`}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Catégorie', ar: 'الفئة', en: 'Category', es: 'Categoría', pt: 'Categoria', tr: 'Kategori' })}</label>
                          <input
                            list="guide-categories"
                            type="text"
                            value={guideForm.category}
                            onChange={e => {
                              setGuideForm({...guideForm, category: e.target.value});
                              if (guideErrors.category) setGuideErrors(prev => ({ ...prev, category: false }));
                            }}
                            className={`w-full rounded-xl px-3 py-2.5 text-slate-700 outline-none transition-all ${guideErrors.category ? 'bg-rose-50 border border-rose-300 focus:border-rose-500' : 'bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border focus:border-orange-500'}`}
                          />
                          <datalist id="guide-categories">
                              <option value={tx(lang, { fr: 'Surpiqûre & Précision', ar: 'الخياطة العلوية والدقة', en: 'Topstitching & Precision', es: 'Pespunte & Precisión', pt: 'Pesponto & Precisão', tr: 'Üst dikiş & Hassasiyet' })} />
                              <option value={tx(lang, { fr: 'Matières Difficiles', ar: 'المواد الصعبة', en: 'Difficult Materials', es: 'Materiales Difíciles', pt: 'Materiais Difíceis', tr: 'Zor Malzemeler' })} />
                              <option value={tx(lang, { fr: 'Problèmes Tissu', ar: 'مشاكل القماش', en: 'Fabric Issues', es: 'Problemas de Tela', pt: 'Problemas de Tecido', tr: 'Kumaş Sorunları' })} />
                              <option value={tx(lang, { fr: 'Fronces & Plis', ar: 'التجاعيد والثنيات', en: 'Gathers & Pleats', es: 'Fruncidos & Pliegues', pt: 'Franzidos & Pregas', tr: 'Büzgüler & Pli' })} />
                              <option value={tx(lang, { fr: 'Guides & Jauges', ar: 'الأدلة والمقاييس', en: 'Guides & Gauges', es: 'Guías & Calibres', pt: 'Guias & Medidores', tr: 'Kılavuzlar & Mastarlar' })} />
                              <option value={tx(lang, { fr: 'Bordeurs & Ourleurs', ar: 'الحواف والتطريز', en: 'Edgers & Hemmers', es: 'Bordeadoras & Dobladilladoras', pt: 'Bordadeiras & Bainhadeiras', tr: 'Kenar & Etek Kıvırma' })} />
                              <option value={tx(lang, { fr: 'Opérations Spéciales', ar: 'عمليات خاصة', en: 'Special Operations', es: 'Operaciones Especiales', pt: 'Operações Especiais', tr: 'Özel İşlemler' })} />
                          </datalist>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Machine', ar: 'الماكينة', en: 'Machine', es: 'Máquina', pt: 'Máquina', tr: 'Makine' })}</label>
                        <div className="relative">
                          <input 
                            list="machine-suggestions" 
                            type="text" 
                            value={guideForm.machineType} 
                            onChange={e => {
                              setGuideForm({...guideForm, machineType: e.target.value});
                              if (guideErrors.machineType) setGuideErrors(prev => ({ ...prev, machineType: false }));
                            }}
                            placeholder={tx(lang, { fr: 'Ex: Piqueuse Plate (301)', ar: 'مثال: ماكينة خياطة مسطحة (301)', en: 'Ex: Flatbed Sewing Machine (301)', es: 'Ej: Máquina de Coser Plana (301)', pt: 'Ex: Máquina de Costura Plana (301)', tr: 'Örn: Düz Dikiş Makinesi (301)' })}
                            className={`w-full rounded-xl px-3 py-2.5 text-slate-700 outline-none transition-all ${guideErrors.machineType ? 'bg-rose-50 border border-rose-300 focus:border-rose-500' : 'bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border focus:border-orange-500'}`}
                          />
                          <datalist id="machine-suggestions">
                            {machines.map(m => (
                                <option key={m.id} value={`${m.name} (${m.classe})`} />
                            ))}
                          </datalist>
                        </div>
                      </div>
                  </div>
                  {(guideErrors.name || guideErrors.category || guideErrors.machineType) && (
                    <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                      {tx(lang, { fr: 'Champs obligatoires: Nom, Catégorie et Machine.', ar: 'الحقول الإلزامية: الاسم والفئة والماكينة', en: 'Required fields: Name, Category and Machine.', es: 'Campos obligatorios: Nombre, Categoría y Máquina.', pt: 'Campos obrigatórios: Nome, Categoria e Máquina.', tr: 'Zorunlu alanlar: Ad, Kategori ve Makine.' })}
                    </p>
                  )}

                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Description', ar: 'الوصف', en: 'Description', es: 'Descripción', pt: 'Descrição', tr: 'Açıklama' })}</label><textarea rows={2} value={guideForm.description} onChange={e => setGuideForm({...guideForm, description: e.target.value})} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-orange-500 transition-all resize-none" /></div>
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">{tx(lang, { fr: 'Utilisation (Cas typiques)', ar: 'الاستخدام (الحالات النموذجية)', en: 'Usage (Typical cases)', es: 'Uso (Casos típicos)', pt: 'Utilização (Casos típicos)', tr: 'Kullanım (Tipik durumlar)' })}</label><input type="text" value={guideForm.useCase} onChange={e => setGuideForm({...guideForm, useCase: e.target.value})} placeholder={tx(lang, { fr: 'Ex: Cuir, Simili...', ar: 'مثال: جلد، جلد صناعي...', en: 'Ex: Leather, Leatherette...', es: 'Ej: Cuero, Similpiel...', pt: 'Ex: Couro, Courino...', tr: 'Örn: Deri, Suni Deri...' })} className="w-full bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-orange-500 transition-all" /></div>

                  <button type="submit" className="w-full py-2.5 rounded-xl bg-orange-600 text-white font-medium hover:bg-orange-700 shadow-lg shadow-orange-200 transition-all mt-2">{tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}</button>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* === FIL EDIT MODAL === */}
      {filEditIndex !== null && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-md" onClick={() => setFilEditIndex(null)} />
          <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200 dark:border-dk-border/70">
            <div className="bg-purple-50 px-6 py-4 border-b border-purple-100 flex items-center justify-between">
              <h3 className="font-bold text-purple-800 flex items-center gap-2">
                {filEditIndex === -1 ? <Plus className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                {filEditIndex === -1 ? tx(lang, { fr: 'Ajouter un type de point', ar: 'إضافة نوع غرزة', en: 'Add a stitch type', es: 'Añadir un tipo de puntada', pt: 'Adicionar um tipo de ponto', tr: 'Bir dikiş tipi ekle' }) : tx(lang, { fr: 'Modifier le coefficient', ar: 'تعديل المعامل', en: 'Edit the coefficient', es: 'Editar el coeficiente', pt: 'Editar o coeficiente', tr: 'Katsayıyı düzenle' })}
              </h3>
              <button onClick={() => setFilEditIndex(null)} className="p-1 hover:bg-purple-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-purple-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {filEditIndex === -1 && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">{tx(lang, { fr: 'Nom du type', ar: 'اسم النوع', en: 'Type name', es: 'Nombre del tipo', pt: 'Nome do tipo', tr: 'Tip adı' })}</label>
                  <input
                    type="text"
                    value={filForm.name || ''}
                    onChange={(e) => setFilForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={tx(lang, { fr: 'ex: Surjeteuse 5 fils', ar: 'مثال: أوفرلوك 5 خيوط', en: 'e.g.: 5-thread Overlock', es: 'ej: Overlock 5 hilos', pt: 'ex: Overloque 5 fios', tr: 'örn: 5 iplikli Overlok' })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 dark:border-dk-border rounded-lg text-sm font-bold focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                  />
                </div>
              )}
              {filEditIndex !== -1 && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">{tx(lang, { fr: 'Type de point', ar: 'نوع الغرزة', en: 'Stitch type', es: 'Tipo de puntada', pt: 'Tipo de ponto', tr: 'Dikiş tipi' })}</label>
                  <p className="font-bold text-slate-700 mt-1">{filForm.name}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">{tx(lang, { fr: 'N° ISO', ar: 'N° ISO', en: 'N° ISO', es: 'N° ISO', pt: 'N° ISO', tr: 'N° ISO' })}</label>
                  <input
                    type="number"
                    value={filForm.isoNumber || ''}
                    onChange={(e) => setFilForm(prev => ({ ...prev, isoNumber: Number(e.target.value) }))}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 dark:border-dk-border rounded-lg text-sm font-bold focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">{tx(lang, { fr: 'Nb fils', ar: 'عدد الخيوط', en: 'Threads', es: 'Nº hilos', pt: 'Nº fios', tr: 'İplik sayısı' })}</label>
                  <input
                    type="number"
                    value={filForm.threadCount || ''}
                    onChange={(e) => setFilForm(prev => ({ ...prev, threadCount: Number(e.target.value) }))}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 dark:border-dk-border rounded-lg text-sm font-bold focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-purple-600 uppercase">{tx(lang, { fr: 'Coefficient (Conso / m)', ar: 'المعامل (الاستهلاك / م)', en: 'Coefficient (Cons. / m)', es: 'Coeficiente (Cons. / m)', pt: 'Coeficiente (Cons. / m)', tr: 'Katsayı (Tük. / m)' })}</label>
                <input
                  type="number"
                  step="0.1"
                  value={filForm.consumptionFactor || ''}
                  onChange={(e) => setFilForm(prev => ({ ...prev, consumptionFactor: Number(e.target.value) }))}
                  className="w-full mt-1 px-3 py-2 border-2 border-purple-300 rounded-lg text-sm font-bold focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none text-purple-700"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">{tx(lang, { fr: 'Machine', ar: 'الماكينة', en: 'Machine', es: 'Máquina', pt: 'Máquina', tr: 'Makine' })}</label>
                <input
                  type="text"
                  value={filForm.machineCode || ''}
                  onChange={(e) => setFilForm(prev => ({ ...prev, machineCode: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 dark:border-dk-border rounded-lg text-sm font-bold focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">{tx(lang, { fr: 'Observations', ar: 'ملاحظات', en: 'Observations', es: 'Observaciones', pt: 'Observações', tr: 'Gözlemler' })}</label>
                <input
                  type="text"
                  value={filForm.observations || ''}
                  onChange={(e) => setFilForm(prev => ({ ...prev, observations: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 dark:border-dk-border rounded-lg text-sm font-bold focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                />
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-dk-elevated px-6 py-4 border-t border-slate-100 dark:border-dk-border/60 flex gap-3">
              <button onClick={() => setFilEditIndex(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border text-slate-600 font-medium hover:bg-slate-50 dark:bg-dk-elevated transition-colors">
                {tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}
              </button>
              <button onClick={saveFilEdit} className="flex-1 px-4 py-2.5 rounded-xl bg-purple-600 text-white font-medium hover:bg-purple-700 shadow-lg shadow-purple-200 transition-all active:scale-95 flex items-center justify-center gap-2">
                <Save className="w-4 h-4" /> {tx(lang, { fr: 'Appliquer', ar: 'تطبيق', en: 'Apply', es: 'Aplicar', pt: 'Aplicar', tr: 'Uygula' })}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* === FIL CONFIRM SAVE MODAL === */}
      {filConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={() => setFilConfirmOpen(false)} />
          <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl w-full max-w-sm relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 text-purple-600"><CheckCircle2 className="w-6 h-6" /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">{tx(lang, { fr: 'Confirmer les modifications ?', ar: 'تأكيد التعديلات؟', en: 'Confirm changes?', es: '¿Confirmar los cambios?', pt: 'Confirmar as alterações?', tr: 'Değişiklikler onaylansın mı?' })}</h3>
            <p className="text-slate-500 text-sm mb-6">{tx(lang, { fr: 'Les nouveaux coefficients seront sauvegardés et utilisés pour les calculs futurs.', ar: 'سيتم حفظ المعاملات الجديدة واستخدامها في الحسابات المستقبلية', en: 'The new coefficients will be saved and used for future calculations.', es: 'Los nuevos coeficientes se guardarán y utilizarán para futuros cálculos.', pt: 'Os novos coeficientes serão guardados e utilizados para cálculos futuros.', tr: 'Yeni katsayılar kaydedilecek ve gelecekteki hesaplamalarda kullanılacak.' })}</p>
            <div className="flex gap-3">
              <button onClick={() => setFilConfirmOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border text-slate-600 font-medium hover:bg-slate-50 dark:bg-dk-elevated transition-colors">{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}</button>
              <button onClick={confirmFilSave} className="flex-1 px-4 py-2.5 rounded-xl bg-purple-600 text-white font-medium hover:bg-purple-700 shadow-lg shadow-purple-200 transition-all active:scale-95">{tx(lang, { fr: 'Confirmer', ar: 'تأكيد', en: 'Confirm', es: 'Confirmar', pt: 'Confirmar', tr: 'Onayla' })}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* === FIL RESET CONFIRM MODAL === */}
      {filResetConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={() => setFilResetConfirmOpen(false)} />
          <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl w-full max-w-sm relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 text-center">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600"><RotateCcw className="w-6 h-6" /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">{tx(lang, { fr: 'Réinitialiser les paramètres ?', ar: 'إعادة تعيين الإعدادات؟', en: 'Reset settings?', es: '¿Restablecer los ajustes?', pt: 'Redefinir as configurações?', tr: 'Ayarlar sıfırlansın mı?' })}</h3>
            <p className="text-slate-500 text-sm mb-6">{tx(lang, { fr: 'Toutes les modifications seront annulées et les valeurs originales seront restaurées.', ar: 'سيتم إلغاء جميع التعديلات واستعادة القيم الأصلية', en: 'All changes will be cancelled and original values restored.', es: 'Todos los cambios serán cancelados y se restaurarán los valores originales.', pt: 'Todas as alterações serão canceladas e os valores originais serão restaurados.', tr: 'Tüm değişiklikler iptal edilecek ve orijinal değerler geri yüklenecek.' })}</p>
            <div className="flex gap-3">
              <button onClick={() => setFilResetConfirmOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border text-slate-600 font-medium hover:bg-slate-50 dark:bg-dk-elevated transition-colors">{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}</button>
              <button onClick={resetFilDefaults} className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 shadow-lg shadow-amber-200 transition-all active:scale-95">{tx(lang, { fr: 'Réinitialiser', ar: 'إعادة تعيين', en: 'Reset', es: 'Restablecer', pt: 'Redefinir', tr: 'Sıfırla' })}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* DELETE MODAL */}
      {deleteData && createPortal(
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={() => setDeleteData(null)} />
          <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl w-full max-w-sm relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 text-center">
            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600"><AlertTriangle className="w-6 h-6" /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">{tx(lang, { fr: 'Supprimer l\'élément ?', ar: 'حذف العنصر؟', en: 'Delete item?', es: '¿Eliminar el elemento?', pt: 'Eliminar o elemento?', tr: 'Öğe silinsin mi?' })}</h3>
            <p className="text-slate-500 text-sm mb-6">{tx(lang, { fr: 'Cette action est irréversible.', ar: 'هذا الإجراء لا يمكن التراجع عنه', en: 'This action is irreversible.', es: 'Esta acción es irreversible.', pt: 'Esta ação é irreversível.', tr: 'Bu işlem geri alınamaz.' })}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteData(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border text-slate-600 font-medium hover:bg-slate-50 dark:bg-dk-elevated transition-colors">{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}</button>
              <button onClick={confirmDelete} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all active:scale-95">{tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Eliminar', tr: 'Sil' })}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
