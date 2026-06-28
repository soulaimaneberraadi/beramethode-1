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
import { useLang } from '../src/context/LanguageContext';
import { tx, type Lang } from '../lib/i18n';

interface EmployeeProfileProps {
  employee: Employee | null;
  tasks: Task[];
  onClose: () => void;
}

const locales: Record<string, string> = {
  fr: 'fr-FR',
  ar: 'ar-AR',
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-PT',
  tr: 'tr-TR',
};

const formatDate = (dStr?: string, lang?: Lang) => {
  if (!dStr) return '—';
  try {
    const loc = locales[lang || 'fr'] || 'fr-FR';
    return new Date(dStr).toLocaleString(loc, { 
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
  const { lang } = useLang();
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

    const completionRate = employeeTasks.length > 0 
      ? Math.round((done.length / employeeTasks.length) * 100) 
      : 100;

    return { active, done, monthDone, completionRate };
  }, [employee, tasks]);

  return (
    <AnimatePresence>
      {employee && data && (
        <motion.div
          className="fixed inset-0 z-[160] bg-slate-900/60 dark:bg-dk-bg/80 backdrop-blur-md flex items-center justify-center p-4 lg:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-5xl h-[90vh] lg:h-auto lg:max-h-[85vh] rounded-[2.5rem] border border-white/20 bg-white dark:bg-dk-surface shadow-2xl dark:shadow-dk-lg overflow-hidden flex flex-col"
            initial={{ y: 50, scale: 0.95, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 30, scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="relative px-8 py-10 border-b border-slate-100 dark:border-dk-border bg-gradient-to-br from-slate-50 dark:from-dk-bg to-white dark:to-dk-surface">
              <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white text-4xl font-black shadow-2xl dark:shadow-dk-lg shadow-indigo-200 dark:shadow-indigo-900/30">
                    {employee.fullName.charAt(0)}
                  </div>
                  <div className="text-center md:text-left">
                    <h3 className="text-3xl font-black text-slate-800 dark:text-dk-text tracking-tight">{employee.fullName}</h3>
                    <div className="flex flex-wrap justify-center md:justify-start items-center gap-3 mt-2">
                       <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-dk-elevated px-3 py-1 rounded-full">{employee.role}</span>
                       <span className="text-sm font-medium text-slate-400 dark:text-dk-muted">ID: {employee.id}</span>
                       {employee.chaineId && (
                          <span className="text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-full">{tx(lang, {fr:'Chaîne:', ar:'الخط:', en:'Line:', es:'Línea:', pt:'Linha:', tr:'Hat:'})} {employee.chaineId}</span>
                       )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-4">
                  <div className="bg-white dark:bg-dk-elevated border border-slate-100 dark:border-dk-border shadow-sm dark:shadow-dk-sm rounded-2xl p-4 flex flex-col items-center min-w-[120px]">
                    <span className="text-[10px] font-black uppercase text-slate-400 dark:text-dk-muted tracking-widest mb-1">{tx(lang, {fr:'Score Performance', ar:'درجة الأداء', en:'Performance Score', es:'Puntuación de Rendimiento', pt:'Pontuação de Desempenho', tr:'Performans Skoru'})}</span>
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none">{data.completionRate}%</span>
                    <div className="w-full bg-slate-100 dark:bg-dk-bg h-1 rounded-full mt-2 overflow-hidden">
                      <div className="bg-emerald-500 h-full" style={{ width: `${data.completionRate}%` }} />
                    </div>
                  </div>
                  <div className="bg-white dark:bg-dk-elevated border border-slate-100 dark:border-dk-border shadow-sm dark:shadow-dk-sm rounded-2xl p-4 flex flex-col items-center min-w-[120px]">
                    <span className="text-[10px] font-black uppercase text-slate-400 dark:text-dk-muted tracking-widest mb-1">{tx(lang, {fr:'Activités du Mois', ar:'أنشطة الشهر', en:'Monthly Activities', es:'Actividades del Mes', pt:'Atividades do Mês', tr:'Aylık Aktiviteler'})}</span>
                    <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text leading-none">{data.monthDone}</span>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted mt-1 uppercase tracking-tighter">{tx(lang, {fr:'Tasks Termitées', ar:'المهام المنجزة', en:'Tasks Completed', es:'Tareas Completadas', pt:'Tarefas Concluídas', tr:'Tamamlanan Görevler'})}</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center md:justify-start gap-4">
                <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-dk-accent text-white text-xs font-black shadow-lg dark:shadow-dk-lg shadow-slate-200 dark:shadow-dk-elevated transition-all hover:scale-105 active:scale-95">
                  <Phone className="w-4 h-4" /> {employee.phoneNumber}
                </button>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black ${employee.isActive ? 'bg-emerald-50 dark:bg-emerald-900/30 dark:bg-green-900/30 text-emerald-700 dark:text-green-300 border-emerald-100 dark:border-green-800' : 'bg-rose-50 dark:bg-rose-900/30 dark:bg-red-900/30 text-rose-700 dark:text-red-300 border-rose-100 dark:border-red-800'}`}>
                   <ShieldCheck className="w-4 h-4" /> {employee.isActive ? tx(lang, {fr:'Profil Actif', ar:'ملف نشط', en:'Active Profile', es:'Perfil Activo', pt:'Perfil Ativo', tr:'Aktif Profil'}) : tx(lang, {fr:'Profil Suspendu', ar:'ملف موقوف', en:'Suspended Profile', es:'Perfil Suspendido', pt:'Perfil Suspenso', tr:'Askıya Alınmış Profil'})}
                </div>
              </div>

              <button 
                onClick={onClose} 
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-white dark:hover:bg-dk-elevated hover:shadow-md text-slate-400 dark:text-dk-muted hover:text-slate-800 dark:hover:text-dk-text transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-0">
              <div className="w-full lg:w-2/5 border-r border-slate-100 dark:border-dk-border p-8 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-lg font-black text-slate-800 dark:text-dk-text flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-indigo-500" /> {tx(lang, {fr:'Missions Actives', ar:'المهام النشطة', en:'Active Missions', es:'Misiones Activas', pt:'Missões Ativas', tr:'Aktif Görevler'})}
                  </h4>
                  <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300 text-[10px] font-black rounded-lg uppercase tracking-widest">
                    {data.active.length} {tx(lang, {fr:'en cours', ar:'قيد التنفيذ', en:'in progress', es:'en curso', pt:'em andamento', tr:'devam ediyor'})}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                  {data.active.map(task => (
                    <motion.div 
                      key={task.id} 
                      className="group p-5 rounded-3xl border border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50 dark:bg-dk-bg/50 hover:bg-white dark:hover:bg-dk-elevated hover:shadow-xl hover:border-indigo-100 dark:hover:border-indigo-800 transition-all"
                      whileHover={{ x: 5 }}
                    >
                      <p className="text-sm font-black text-slate-800 dark:text-dk-text mb-1 group-hover:text-indigo-600 dark:text-dk-accent-text dark:group-hover:text-dk-accent-text transition-colors">{task.title}</p>
                      <p className="text-xs text-slate-500 dark:text-dk-text-soft leading-relaxed mb-4 line-clamp-3">{task.description || '—'}</p>
                      <div className="flex items-center justify-between">
                         <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest">
                           <Calendar className="w-3 h-3" /> {formatDate(task.createdAt, lang)}
                         </span>
                         <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter ${task.status === 'IN_PROGRESS' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300' : 'bg-slate-200 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft'}`}>
                           {task.status === 'IN_PROGRESS' ? tx(lang, {fr:'En Cours', ar:'قيد التنفيذ', en:'In Progress', es:'En Curso', pt:'Em Andamento', tr:'Devam Ediyor'}) : tx(lang, {fr:'À Faire', ar:'للتنفيذ', en:'To Do', es:'Por Hacer', pt:'A Fazer', tr:'Yapılacak'})}
                         </span>
                      </div>
                    </motion.div>
                  ))}
                  
                  {data.active.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-dk-muted opacity-60">
                      <CheckCircle2 className="w-12 h-12 mb-3 stroke-[1.5]" />
                      <p className="text-sm font-bold">{tx(lang, {fr:'Aucune mission en attente', ar:'لا توجد مهام معلقة', en:'No pending missions', es:'Ninguna misión pendiente', pt:'Nenhuma missão pendente', tr:'Bekleyen görev yok'})}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 bg-white dark:bg-dk-surface p-8 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-lg font-black text-slate-800 dark:text-dk-text flex items-center gap-2">
                    <History className="w-5 h-5 text-emerald-500" /> {tx(lang, {fr:'Historique de Performance', ar:'سجل الأداء', en:'Performance History', es:'Historial de Rendimiento', pt:'Histórico de Desempenho', tr:'Performans Geçmişi'})}
                  </h4>
                  <p className="text-xs font-bold text-slate-400 dark:text-dk-muted">{tx(lang, {fr:'Toutes les tâches terminées', ar:'جميع المهام المنتهية', en:'All completed tasks', es:'Todas las tareas terminadas', pt:'Todas as tarefas concluídas', tr:'Tamamlanan tüm görevler'})}</p>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                  {data.done.map(task => (
                    <div key={task.id} className="relative pl-8 pb-4 group last:pb-0">
                      <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-slate-100 dark:bg-dk-border group-last:hidden" />
                      <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-900/30 dark:bg-green-900/30 border-2 border-emerald-500 flex items-center justify-center z-10">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      
                      <div className="p-5 rounded-3xl border border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-lg transition-all">
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-sm font-black text-slate-800 dark:text-dk-text">{task.title}</p>
                          <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 dark:text-green-300 bg-emerald-50 dark:bg-emerald-900/30 dark:bg-green-900/30 px-2 py-0.5 rounded">{tx(lang, {fr:'TERMINÉ', ar:'مُنْجَز', en:'COMPLETED', es:'TERMINADO', pt:'CONCLUÍDO', tr:'TAMAMLANDI'})}</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-dk-text-soft mb-3">{task.description || tx(lang, {fr:'Action réalisée conformément aux instructions.', ar:'تم تنفيذ الإجراء وفقاً للتعليمات.', en:'Action completed as per instructions.', es:'Acción realizada según instrucciones.', pt:'Ação realizada conforme as instruções.', tr:'İşlem talimatlara uygun şekilde gerçekleştirildi.'})}</p>
                        <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest">
                          <span className="flex items-center gap-1"><Clock3 className="w-3 h-3 text-slate-300 dark:text-dk-muted" /> {formatDate(task.completedAt, lang)}</span>
                          <span className="flex items-center gap-1"><User className="w-3 h-3 text-slate-300 dark:text-dk-muted" /> {tx(lang, {fr:'Par:', ar:'بواسطة:', en:'By:', es:'Por:', pt:'Por:', tr:'Tarafından:'})} {task.assignedBy}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {data.done.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-dk-muted opacity-60">
                      <TrendingUp className="w-12 h-12 mb-3 stroke-[1.5]" />
                      <p className="text-sm font-bold">{tx(lang, {fr:'Aucun historique disponible', ar:'لا يوجد سجل متاح', en:'No history available', es:'Ningún historial disponible', pt:'Nenhum histórico disponível', tr:'Geçmiş mevcut değil'})}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-8 py-4 bg-slate-50 dark:bg-dk-bg border-t border-slate-100 dark:border-dk-border flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted tracking-widest uppercase">{tx(lang, {fr:'Expert RH Module • BERAMETHODE', ar:'خبير الموارد البشرية • BERAMETHODE', en:'HR Expert Module • BERAMETHODE', es:'Módulo Experto RH • BERAMETHODE', pt:'Módulo Especialista RH • BERAMETHODE', tr:'İK Uzman Modülü • BERAMETHODE'})}</p>
              <div className="flex gap-2">
                 <button className="px-4 py-2 rounded-xl text-[11px] font-black bg-white dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 dark:hover:bg-dk-elevated/60 transition-all">
                   {tx(lang, {fr:'GÉNÉRER RAPPORT', ar:'توليد تقرير', en:'GENERATE REPORT', es:'GENERAR INFORME', pt:'GERAR RELATÓRIO', tr:'RAPOR OLUŞTUR'})}
                 </button>
                 <button 
                  onClick={onClose}
                  className="px-6 py-2 rounded-xl text-[11px] font-black bg-indigo-600 dark:bg-dk-accent text-white hover:bg-indigo-700 dark:hover:bg-dk-accent-hover transition-all shadow-md dark:shadow-dk-md shadow-indigo-100 dark:shadow-indigo-900/30"
                 >
                    {tx(lang, {fr:'FERMER', ar:'إغلاق', en:'CLOSE', es:'CERRAR', pt:'FECHAR', tr:'KAPAT'})}
                 </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
