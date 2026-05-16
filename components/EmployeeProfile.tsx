import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Employee, Task } from '../types';
import { 
  Phone, 
  ShieldCheck, 
  Clock3, 
  CheckCircle2, 
  X, 
  TrendingUp, 
  AlertCircle, 
  Calendar, 
  User,
  ExternalLink,
  History
} from 'lucide-react';

interface EmployeeProfileProps {
  employee: Employee | null;
  tasks: Task[];
  onClose: () => void;
}

const formatDate = (dStr?: string) => {
  if (!dStr) return '—';
  try {
    return new Date(dStr).toLocaleString('fr-FR', { 
      day: 'numeric', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } catch {
    return dStr;
  }
};

export default function EmployeeProfile({ employee, tasks, onClose }: EmployeeProfileProps) {
  const data = useMemo(() => {
    if (!employee) return null;
    const employeeTasks = tasks.filter(t => t.assignedTo === employee.id);
    const active = employeeTasks.filter(t => t.status === 'TODO' || t.status === 'IN_PROGRESS');
    const done = employeeTasks
      .filter(t => t.status === 'DONE')
      .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
    
    const now = new Date();
    const monthDone = done.filter(t => {
      const c = t.completedAt ? new Date(t.completedAt) : null;
      return c && c.getMonth() === now.getMonth() && c.getFullYear() === now.getFullYear();
    }).length;

    // Performance Metric: Tasks completed vs total (simplified)
    const completionRate = employeeTasks.length > 0 
      ? Math.round((done.length / employeeTasks.length) * 100) 
      : 100;

    return { active, done, monthDone, completionRate };
  }, [employee, tasks]);

  return (
    <AnimatePresence>
      {employee && data && (
        <motion.div
          className="fixed inset-0 z-[160] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 lg:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-5xl h-[90vh] lg:h-auto lg:max-h-[85vh] rounded-[2.5rem] border border-white/20 bg-white shadow-2xl overflow-hidden flex flex-col"
            initial={{ y: 50, scale: 0.95, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 30, scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* GLASS HEADER */}
            <div className="relative px-8 py-10 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
              <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-4xl font-black shadow-2xl shadow-indigo-200">
                    {employee.fullName.charAt(0)}
                  </div>
                  <div className="text-center md:text-left">
                    <h3 className="text-3xl font-black text-slate-800 tracking-tight">{employee.fullName}</h3>
                    <div className="flex flex-wrap justify-center md:justify-start items-center gap-3 mt-2">
                       <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{employee.role}</span>
                       <span className="text-sm font-medium text-slate-400">ID: {employee.id}</span>
                       {employee.chaineId && (
                         <span className="text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">Chaîne: {employee.chaineId}</span>
                       )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-4">
                  <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-4 flex flex-col items-center min-w-[120px]">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Score Performance</span>
                    <span className="text-2xl font-black text-emerald-600 leading-none">{data.completionRate}%</span>
                    <div className="w-full bg-slate-100 h-1 rounded-full mt-2 overflow-hidden">
                      <div className="bg-emerald-500 h-full" style={{ width: `${data.completionRate}%` }} />
                    </div>
                  </div>
                  <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-4 flex flex-col items-center min-w-[120px]">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Activités du Mois</span>
                    <span className="text-2xl font-black text-indigo-600 leading-none">{data.monthDone}</span>
                    <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Tasks Termitées</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center md:justify-start gap-4">
                <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black shadow-lg shadow-slate-200 transition-all hover:scale-105 active:scale-95">
                  <Phone className="w-4 h-4" /> {employee.phoneNumber}
                </button>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black ${employee.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                   <ShieldCheck className="w-4 h-4" /> {employee.isActive ? 'Profil Actif' : 'Profil Suspendu'}
                </div>
              </div>

              <button 
                onClick={onClose} 
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-white hover:shadow-md text-slate-400 hover:text-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* BODY CONTENT */}
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-0">
              {/* ACTIVE TASKS SIDEBAR */}
              <div className="w-full lg:w-2/5 border-r border-slate-100 p-8 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-indigo-500" /> Missions Actives
                  </h4>
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-lg uppercase tracking-widest">
                    {data.active.length} en cours
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                  {data.active.map(task => (
                    <motion.div 
                      key={task.id} 
                      className="group p-5 rounded-3xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-xl hover:border-indigo-100 transition-all"
                      whileHover={{ x: 5 }}
                    >
                      <p className="text-sm font-black text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">{task.title}</p>
                      <p className="text-xs text-slate-500 leading-relaxed mb-4 line-clamp-3">{task.description || '—'}</p>
                      <div className="flex items-center justify-between">
                         <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                           <Calendar className="w-3 h-3" /> {formatDate(task.createdAt)}
                         </span>
                         <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter ${task.status === 'IN_PROGRESS' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>
                           {task.status === 'IN_PROGRESS' ? 'En Cours' : 'À Faire'}
                         </span>
                      </div>
                    </motion.div>
                  ))}
                  
                  {data.active.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                      <CheckCircle2 className="w-12 h-12 mb-3 stroke-[1.5]" />
                      <p className="text-sm font-bold">Aucune mission en attente</p>
                    </div>
                  )}
                </div>
              </div>

              {/* HISTORY FEED */}
              <div className="flex-1 bg-white p-8 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <History className="w-5 h-5 text-emerald-500" /> Historique de Performance
                  </h4>
                  <p className="text-xs font-bold text-slate-400">Toutes les tâches terminées</p>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                  {data.done.map(task => (
                    <div key={task.id} className="relative pl-8 pb-4 group last:pb-0">
                      {/* Timeline Line */}
                      <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-slate-100 group-last:hidden" />
                      {/* Timeline Dot */}
                      <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center z-10">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      </div>
                      
                      <div className="p-5 rounded-3xl border border-slate-100 bg-white hover:border-emerald-200 hover:shadow-lg transition-all">
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-sm font-black text-slate-800">{task.title}</p>
                          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">TERMINÉ</span>
                        </div>
                        <p className="text-xs text-slate-500 mb-3">{task.description || 'Action réalisée conformément aux instructions.'}</p>
                        <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          <span className="flex items-center gap-1"><Clock3 className="w-3 h-3 text-slate-300" /> {formatDate(task.completedAt)}</span>
                          <span className="flex items-center gap-1"><User className="w-3 h-3 text-slate-300" /> Par: {task.assignedBy}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {data.done.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                      <TrendingUp className="w-12 h-12 mb-3 stroke-[1.5]" />
                      <p className="text-sm font-bold">Aucun historique disponible</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* BARRE DE PIED (Actions Rapides) */}
            <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Expert RH Module • BERAMETHODE</p>
              <div className="flex gap-2">
                 <button className="px-4 py-2 rounded-xl text-[11px] font-black bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all">
                   GÉNÉRER RAPPORT
                 </button>
                 <button 
                  onClick={onClose}
                  className="px-6 py-2 rounded-xl text-[11px] font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
                 >
                   FERMER
                 </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
