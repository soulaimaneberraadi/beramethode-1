import React from 'react';
import { PlanningEvent, ModelData, AppSettings } from '../../types';
import { AlertTriangle, Calendar, Check, Clock, Edit2, Layers, MoreVertical } from 'lucide-react';
import { useLang } from '../../src/context/LanguageContext';
import { tx } from '../../lib/i18n';

interface PlanningCardsViewProps {
    planningEvents: PlanningEvent[];
    models: ModelData[];
    chaines: { id: string; name: string; efficiency: number }[];
    statusConfig: Record<string, { label: string; bar: string; bg: string; border: string; dot: string }>;
    onSelectedEvent: (ev: PlanningEvent) => void;
    onEditEvent?: (ev: PlanningEvent) => void;
}

export default function PlanningCardsView({
    planningEvents,
    models,
    chaines,
    statusConfig,
    onSelectedEvent,
    onEditEvent
}: PlanningCardsViewProps) {
    const { lang } = useLang();

    const getProgress = (ev: PlanningEvent) => {
        const qty  = ev.totalQuantity  || ev.qteTotal || 1;
        const prod = ev.producedQuantity || ev.qteProduite || 0;
        return Math.min(100, Math.round((prod / qty) * 100));
    };

    const isAtRisk = (ev: PlanningEvent) => {
        if (ev.status === 'BLOCKED_STOCK') return true;
        const end = ev.estimatedEndDate || ev.dateExport;
        const dds = ev.strictDeadline_DDS;
        return !!(end && dds && new Date(end) > new Date(dds));
    };

    if (planningEvents.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500 dark:text-dk-muted">
                <Layers className="w-12 h-12 mb-4 opacity-20" />
                <p>{tx(lang,{fr:"Aucun ordre planifié pour l'instant.",ar:"لا توجد أوامر مخططة حالياً",en:"No orders planned yet.",es:"Ninguna orden planificada aún.",pt:"Nenhuma ordem planejada ainda.",tr:"Henüz planlanmış emir yok."})}</p>
                <p className="text-sm mt-2">{tx(lang,{fr:"Glissez un modèle depuis la bibliothèque ou cliquez sur Planifier.",ar:"اسحب نموذجاً من المكتبة أو انقر على تخطيط.",en:"Drag a model from the library or click Schedule.",es:"Arrastre un modelo desde la biblioteca o haga clic en Planificar.",pt:"Arraste um modelo da biblioteca ou clique em Planejar.",tr:"Kütüphaneden bir model sürükleyin veya Planla'ya tıklayın."})}</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto p-6 bg-gray-950">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {planningEvents.map(ev => {
                    const cfg = statusConfig[ev.status] || statusConfig['ON_TRACK'];
                    const risk = isAtRisk(ev);
                    const qty = ev.totalQuantity || ev.qteTotal || 0;
                    const prod = ev.producedQuantity || ev.qteProduite || 0;
                    const progress = getProgress(ev);
                    const chaine = chaines.find(c => c.id === ev.chaineId);
                    const name = ev.modelName || models.find(m => m.id === ev.modelId)?.meta_data?.nom_modele || 'Ordre';
                    const client = ev.clientName || models.find(m => m.id === ev.modelId)?.ficheData?.client || '';

                    return (
                        <div
                            key={ev.id}
                            onClick={() => onSelectedEvent(ev)}
                            className={`bg-gray-900 border rounded-xl p-4 flex flex-col cursor-pointer transition-all hover:bg-gray-800 overflow-hidden relative ${risk ? 'border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'border-gray-800 hover:border-gray-600'}`}
                        >
                            {ev.color && <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: ev.color }} />}
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="font-bold text-gray-100 flex items-center gap-2">
                                        {name}
                                        {risk && <AlertTriangle className="w-4 h-4 text-red-500" />}
                                    </h3>
                                    {client && <p className="text-xs text-gray-500 dark:text-dk-muted mt-1">{client}</p>}
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${cfg.bg} ${cfg.border} text-gray-200 border`}>
                                    {cfg.label}
                                </span>
                            </div>

                            <div className="space-y-2 mb-4 text-sm text-gray-400 dark:text-dk-muted">
                                <div className="flex justify-between">
                                    <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> {tx(lang, {fr:"Ligne",ar:"خط",en:"Line",es:"Línea",pt:"Linha",tr:"Hat"})}</span>
                                    <span className="font-semibold text-gray-200">{chaine?.name || ev.chaineId}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {tx(lang, {fr:"Fin est.",ar:"نهاية تقديرية",en:"Est. end",es:"Fin est.",pt:"Término est.",tr:"Tah. bitiş"})}</span>
                                    <span className={`font-semibold ${risk ? 'text-red-400' : 'text-gray-200'}`}>
                                        {(ev.estimatedEndDate || ev.dateExport || '').split('T')[0]}
                                    </span>
                                </div>
                                {ev.strictDeadline_DDS && (
                                    <div className="flex justify-between border-t border-gray-800/50 pt-2 mt-2">
                                        <span className="flex items-center gap-1.5 text-xs"><Clock className="w-3 h-3" /> {tx(lang, {fr:"DDS",ar:"DDS",en:"DDS",es:"DDS",pt:"DDS",tr:"DDS"})}</span>
                                        <span className="text-xs font-bold text-amber-500">{ev.strictDeadline_DDS}</span>
                                    </div>
                                )}
                            </div>

                            <div className="mt-auto pt-3 border-t border-gray-800">
                                <div className="flex justify-between text-xs mb-1.5 font-semibold">
                                    <span className="text-gray-400 dark:text-dk-muted">{prod} / {qty} <span className="text-gray-600 dark:text-dk-text-soft">pcs</span></span>
                                    <span className="text-gray-300 dark:text-dk-muted">{progress}%</span>
                                </div>
                                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div className={`h-full ${cfg.bar} transition-all`} style={{ width: `${progress}%` }} />
                                </div>
                                
                                {ev.lots_data && ev.lots_data.length > 0 && (
                                    <div className="mt-3 flex gap-1 items-center">
                                        {ev.lots_data.map((lot, i) => (
                                            <div 
                                                key={lot.id || i} 
                                                className={`flex-1 h-1 rounded-full ${lot.status === 'DELIVERED' || lot.status === 'READY' ? 'bg-indigo-500' : 'bg-gray-700'}`}
                                                title={`Lot: ${lot.taille} - ${lot.quantite} pcs`}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
