
import React, { useState, useMemo } from 'react';
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
  CheckCircle2 
} from 'lucide-react';
import { Machine, SpeedFactor, ComplexityFactor, StandardTime, Guide } from '../types';

interface MachinProps {
  machines: Machine[];
  onSave: (machine: Machine) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  
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
  onSave, 
  onDelete, 
  onToggle,
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
  // Navigation State: 'menu' is the landing page with buttons
  const [currentView, setCurrentView] = useState<'menu' | 'machines' | 'standards' | 'guides'>('menu');
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
    if (!machineForm.name || !machineForm.classe) return;
    const toSave: Machine = { ...(machineForm as Machine), id: editingItem?.id || Date.now().toString() };
    onSave(toSave);
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
    if (!guideForm.name) return;
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
  };

  const confirmDelete = () => {
    if (!deleteData) return;
    const { type, id } = deleteData;
    
    if (type === 'machine') onDelete(id);
    else if (type === 'speed') setSpeedFactors(prev => prev.filter(i => i.id !== id));
    else if (type === 'complexity') setComplexityFactors(prev => prev.filter(i => i.id !== id));
    else if (type === 'time') setStandardTimes(prev => prev.filter(i => i.id !== id));
    else if (type === 'guide') setGuides(prev => prev.filter(i => i.id !== id));
    
    setDeleteData(null);
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
    <button 
      onClick={onClick}
      className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-emerald-200 transition-all text-left group flex flex-col h-full"
    >
      <div className={`w-14 h-14 rounded-2xl ${bgClass} ${colorClass} flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform duration-300`}>
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-xl font-bold text-slate-800 mb-2 group-hover:text-emerald-700 transition-colors">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed mb-6 flex-1">{desc}</p>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-400 group-hover:text-emerald-600 transition-colors">
        <span>Accéder</span>
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </div>
    </button>
  );

  return (
    <div className="h-full w-full overflow-y-auto p-4 md:p-6 custom-scrollbar space-y-6 pb-24">
      
      {/* HEADER WITH NAVIGATION */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            {currentView === 'menu' ? (
              <>
                <h1 className="text-2xl font-bold text-slate-800">Paramètres & Configuration</h1>
                <p className="text-slate-500 text-sm mt-1">Gestion du parc machines et des standards de temps</p>
              </>
            ) : (
              <div className="flex items-center gap-3">
                 <button 
                   onClick={() => setCurrentView('menu')}
                   className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-50 hover:text-slate-800 transition-colors"
                 >
                   <ChevronLeft className="w-6 h-6" />
                 </button>
                 <div>
                   <h1 className="text-2xl font-bold text-slate-800">
                     {currentView === 'machines' && 'Parc Machines'}
                     {currentView === 'standards' && 'Standards & Temps'}
                     {currentView === 'guides' && 'Guides & Accessoires'}
                   </h1>
                   <p className="text-slate-500 text-sm mt-1">
                     {currentView === 'machines' && 'Liste complète et configuration des machines'}
                     {currentView === 'standards' && 'Coefficients de majoration et temps prédéfinis'}
                     {currentView === 'guides' && 'Pieds de biche, guides et attachements spéciaux'}
                   </p>
                 </div>
              </div>
            )}
          </div>

          {/* Autocomplete Toggle */}
          {currentView === 'menu' && setIsAutocompleteEnabled && (
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1"><Type className="w-3 h-3 text-indigo-500" /> Autocomplétion</span>
                      <span className="text-[10px] text-slate-400">Suggestions intelligentes</span>
                  </div>
                  <button 
                      onClick={() => setIsAutocompleteEnabled(prev => !prev)}
                      className={`w-10 h-5 rounded-full p-1 transition-colors relative flex items-center ${isAutocompleteEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                      <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform duration-300 ${isAutocompleteEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
              </div>
          )}
        </div>
      </div>

      {/* === VIEW: MENU (DASHBOARD) === */}
      {currentView === 'menu' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4 max-w-5xl mx-auto">
          <MenuCard 
            title="Parc Machines" 
            desc="Gérez votre liste de machines, vitesses, classes et coefficients de majoration."
            icon={Scissors}
            bgClass="bg-emerald-50"
            colorClass="text-emerald-600"
            onClick={() => setCurrentView('machines')}
          />
          <MenuCard 
            title="Standards & Temps" 
            desc="Configurez les temps standards, les facteurs de complexité et les vitesses."
            icon={Settings}
            bgClass="bg-indigo-50"
            colorClass="text-indigo-600"
            onClick={() => setCurrentView('standards')}
          />
          <MenuCard 
            title="Guides & Accessoires" 
            desc="Base de données des pieds de biche, guides et outils d'aide à la confection."
            icon={Layers}
            bgClass="bg-orange-50"
            colorClass="text-orange-600"
            onClick={() => setCurrentView('guides')}
          />
        </div>
      )}

      {/* === VIEW: MACHINES === */}
      {currentView === 'machines' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 px-4">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input 
                type="text" 
                placeholder="Rechercher par nom ou classe..." 
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
              <span>Ajouter Machine</span>
            </button>
          </div>

          <div className="hidden sm:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Machine</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">Classe</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">Vitesse</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">Majoration</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">COFS</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">État</th>
                    <th className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMachines.map((machine) => (
                    <tr key={machine.id} className={`group transition-colors hover:bg-slate-50/80 ${!machine.active ? 'opacity-60 bg-slate-50/50' : ''}`}>
                      <td className="py-2.5 px-4"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${machine.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><Scissors className="w-4 h-4" /></div><span className="font-semibold text-slate-700 text-sm">{machine.name}</span></div></td>
                      <td className="py-2.5 px-4 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">{machine.classe}</span></td>
                      <td className="py-2.5 px-4 text-center text-slate-600 font-mono text-sm">{machine.speed}</td>
                      <td className="py-2.5 px-4 text-center text-slate-600 font-mono text-sm">{machine.speedMajor}</td>
                      <td className="py-2.5 px-4 text-center"><span className="font-bold text-slate-700 text-sm">{machine.cofs}</span></td>
                      <td className="py-2.5 px-4 text-center"><button onClick={() => onToggle(machine.id)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${machine.active ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${machine.active ? 'translate-x-5' : 'translate-x-1'}`} /></button></td>
                      <td className="py-2.5 px-4 text-right"><div className="flex items-center justify-end gap-1"><button onClick={() => openMachineModal(machine)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button><button onClick={() => setDeleteData({ type: 'machine', id: machine.id })} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
           {/* MOBILE CARDS */}
           <div className="grid grid-cols-1 gap-4 sm:hidden">
            {filteredMachines.map((machine) => (
              <div key={machine.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                 <div className="flex justify-between items-center mb-2">
                    <span className="font-bold">{machine.name}</span>
                    <button onClick={() => openMachineModal(machine)}><Edit2 className="w-4 h-4 text-slate-400"/></button>
                 </div>
                 <div className="text-sm text-slate-500">Classe: {machine.classe} | Vitesse: {machine.speed}</div>
              </div>
            ))}
           </div>
        </div>
      )}

      {/* === VIEW: STANDARDS === */}
      {currentView === 'standards' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
          
          {/* 1. FACTEURS DE COMPLEXITÉ */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-800">Facteurs de Guide (Complexité)</h3>
                <p className="text-xs text-slate-500">Coefficients appliqués selon la difficulté de manipulation.</p>
              </div>
              <button onClick={() => openComplexityModal()} className="p-2 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-colors shadow-sm">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                  <tr>
                    <th className="py-3 px-6">Description</th>
                    <th className="py-3 px-6 text-center">Majoration</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {complexityFactors.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
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
                  {complexityFactors.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-400 italic text-xs">Aucun facteur défini.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. FACTEURS DE VITESSE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-800">Facteurs de Vitesse (RPM)</h3>
                <p className="text-xs text-slate-500">Ajustements automatiques selon la vitesse machine.</p>
              </div>
              <button onClick={() => openSpeedModal()} className="p-2 bg-white border border-slate-200 rounded-lg hover:border-emerald-300 hover:text-emerald-600 transition-colors shadow-sm">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                  <tr>
                    <th className="py-3 px-6">Plage (RPM)</th>
                    <th className="py-3 px-6 text-center">Majoration</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {speedFactors.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
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
                  {speedFactors.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-400 italic text-xs">Aucune plage définie.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. TEMPS STANDARDS */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-800">Temps Standards & Fréquences</h3>
                <p className="text-xs text-slate-500">Valeurs prédéfinies pour opérations courantes.</p>
              </div>
              <button onClick={() => openTimeModal()} className="p-2 bg-white border border-slate-200 rounded-lg hover:border-amber-300 hover:text-amber-600 transition-colors shadow-sm">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                  <tr>
                    <th className="py-3 px-6">Opération / Tâche</th>
                    <th className="py-3 px-6 text-center">Valeur</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {standardTimes.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
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
                  {standardTimes.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-400 italic text-xs">Aucun standard défini.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* === VIEW: GUIDES === */}
      {currentView === 'guides' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 px-4">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input 
                type="text" 
                placeholder="Rechercher un guide, un pied, une machine..." 
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
              <span>Ajouter Guide</span>
            </button>
          </div>

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
                              <div key={guide.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all group relative">
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
                                      {guide.description || "Aucune description."}
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
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                  <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <h3 className="text-slate-500 font-bold">Aucun guide trouvé</h3>
                  <p className="text-slate-400 text-sm">Ajoutez des guides pour enrichir votre base de données.</p>
              </div>
          )}

        </div>
      )}

      {/* ... MODALS ... */}
      {modalType && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={closeModal} />
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                {editingItem ? <Edit2 className="w-4 h-4 text-emerald-600" /> : <Plus className="w-4 h-4 text-emerald-600" />}
                {editingItem ? 'Modifier' : 'Ajouter'} 
                {modalType === 'machine' && ' Machine'}
                {modalType === 'speed' && ' Facteur Vitesse'}
                {modalType === 'complexity' && ' Facteur Guide'}
                {modalType === 'time' && ' Temps Standard'}
                {modalType === 'guide' && ' Guide / Accessoire'}
              </h3>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
                {modalType === 'machine' && (
                <form onSubmit={saveMachine} className="space-y-4">
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Nom</label><input type="text" required value={machineForm.name} onChange={e => setMachineForm({...machineForm, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Classe</label><input type="text" required value={machineForm.classe} onChange={e => setMachineForm({...machineForm, classe: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Vitesse</label><input type="number" required value={machineForm.speed} onChange={e => setMachineForm({...machineForm, speed: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Majoration</label><input type="number" step="0.01" required value={machineForm.speedMajor} onChange={e => setMachineForm({...machineForm, speedMajor: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">COFS</label><input type="number" step="0.01" required value={machineForm.cofs} onChange={e => setMachineForm({...machineForm, cofs: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                  </div>
                  <button type="submit" className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all mt-2">Enregistrer</button>
                </form>
              )}
              {modalType === 'speed' && (
                <form onSubmit={saveSpeed} className="space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Min</label><input type="number" required value={speedForm.min} onChange={e => setSpeedForm({...speedForm, min: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Max</label><input type="number" required value={speedForm.max} onChange={e => setSpeedForm({...speedForm, max: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                  </div>
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Majoration</label><input type="number" step="0.01" required value={speedForm.value} onChange={e => setSpeedForm({...speedForm, value: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-emerald-500 transition-all" /></div>
                  <button type="submit" className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all mt-2">Enregistrer</button>
                </form>
              )}
              {modalType === 'complexity' && (
                <form onSubmit={saveComplexity} className="space-y-4">
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Description</label><input type="text" required value={complexityForm.label} onChange={e => setComplexityForm({...complexityForm, label: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-indigo-500 transition-all" /></div>
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Majoration</label><input type="number" step="0.01" required value={complexityForm.value} onChange={e => setComplexityForm({...complexityForm, value: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-indigo-500 transition-all" /></div>
                  <button type="submit" className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all mt-2">Enregistrer</button>
                </form>
              )}
              {modalType === 'time' && (
                <form onSubmit={saveTime} className="space-y-4">
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Opération</label><input type="text" required value={timeForm.label} onChange={e => setTimeForm({...timeForm, label: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-amber-500 transition-all" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Valeur</label><input type="number" step="0.001" required value={timeForm.value} onChange={e => setTimeForm({...timeForm, value: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-amber-500 transition-all" /></div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Unité</label>
                      <select value={timeForm.unit} onChange={e => setTimeForm({...timeForm, unit: e.target.value as 'min'|'sec'})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-amber-500 transition-all">
                        <option value="min">Minute (min)</option>
                        <option value="sec">Seconde (s)</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="w-full py-2.5 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700 shadow-lg shadow-amber-200 transition-all mt-2">Enregistrer</button>
                </form>
              )}
              {modalType === 'guide' && (
                <form onSubmit={saveGuide} className="space-y-4">
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Nom</label><input type="text" required value={guideForm.name} onChange={e => setGuideForm({...guideForm, name: e.target.value})} placeholder="Ex: Pied Téflon" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-orange-500 transition-all" /></div>
                  
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Catégorie</label>
                          <input list="guide-categories" type="text" required value={guideForm.category} onChange={e => setGuideForm({...guideForm, category: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-orange-500 transition-all" />
                          <datalist id="guide-categories">
                              <option value="Surpiqûre & Précision" />
                              <option value="Matières Difficiles" />
                              <option value="Problèmes Tissu" />
                              <option value="Fronces & Plis" />
                              <option value="Guides & Jauges" />
                              <option value="Bordeurs & Ourleurs" />
                              <option value="Opérations Spéciales" />
                          </datalist>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Machine</label>
                        <div className="relative">
                          <input 
                            list="machine-suggestions" 
                            type="text" 
                            value={guideForm.machineType} 
                            onChange={e => setGuideForm({...guideForm, machineType: e.target.value})} 
                            placeholder="Ex: Piqueuse Plate (301)" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-orange-500 transition-all" 
                          />
                          <datalist id="machine-suggestions">
                            {machines.map(m => (
                                <option key={m.id} value={`${m.name} (${m.classe})`} />
                            ))}
                          </datalist>
                        </div>
                      </div>
                  </div>

                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Description</label><textarea rows={2} value={guideForm.description} onChange={e => setGuideForm({...guideForm, description: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-orange-500 transition-all resize-none" /></div>
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Utilisation (Cas typiques)</label><input type="text" value={guideForm.useCase} onChange={e => setGuideForm({...guideForm, useCase: e.target.value})} placeholder="Ex: Cuir, Simili..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-orange-500 transition-all" /></div>

                  <button type="submit" className="w-full py-2.5 rounded-xl bg-orange-600 text-white font-medium hover:bg-orange-700 shadow-lg shadow-orange-200 transition-all mt-2">Enregistrer</button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {deleteData && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDeleteData(null)} />
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 text-center">
            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600"><AlertTriangle className="w-6 h-6" /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Supprimer l'élément ?</h3>
            <p className="text-slate-500 text-sm mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteData(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors">Annuler</button>
              <button onClick={confirmDelete} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all active:scale-95">Supprimer</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
