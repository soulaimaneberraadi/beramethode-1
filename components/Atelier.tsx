import React, { useState, useEffect, useMemo } from 'react';
import { ModelData, PlanningEvent, MouvementStock, DemandeAppro, SuiviData, AppSettings } from '../types';
import { Factory, Calendar, Package, CheckSquare, Plus, AlertCircle, Clock, ChevronRight, Search, FileText, Send, ArrowLeft, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

interface AtelierProps {
    models: ModelData[];
    planningEvents: PlanningEvent[];
    suivis: SuiviData[];
    settings: AppSettings;
    handleAddDemandeAppro: (d: Partial<DemandeAppro>) => void;
    // NEW: setters for real logic
    setPlanningEvents: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
    setModels: React.Dispatch<React.SetStateAction<ModelData[]>>;
    setSuivis: React.Dispatch<React.SetStateAction<SuiviData[]>>;
}

export default function Atelier({ models, planningEvents, suivis, settings, handleAddDemandeAppro, setPlanningEvents, setModels, setSuivis }: AtelierProps) {
    const { lang } = useLang();
    const [tab, setTab] = useState<'dashboard' | 'demandes' | 'cloture'>('dashboard');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    // Demande Form State
    const [demandeOF, setDemandeOF] = useState('');
    const [demandeArticle, setDemandeArticle] = useState('');
    const [demandeQty, setDemandeQty] = useState(0);
    const [demandeDemandeur, setDemandeDemandeur] = useState('');
    const [demandeMotif, setDemandeMotif] = useState('');
    const [demandeSent, setDemandeSent] = useState(false);

    // Clôture Form State
    const [clotureOF, setClotureOF] = useState('');
    const [piecesBonnes, setPiecesBonnes] = useState(0);
    const [piecesRebut, setPiecesRebut] = useState(0);
    const [heuresProduction, setHeuresProduction] = useState(0);
    const [retourLines, setRetourLines] = useState<{ ref: string; qty: number }[]>([{ ref: '', qty: 0 }]);
    const [clotureDone, setClotureDone] = useState(false);

    // Derived Data
    const todayEvents = useMemo(() => planningEvents.filter(e => {
        const start = e.dateLancement ? e.dateLancement.split('T')[0] : '';
        const end = e.dateFin ? e.dateFin.split('T')[0] : (e.dateExport ? e.dateExport.split('T')[0] : start);
        if (!start) return false;
        return selectedDate >= start && selectedDate <= end && e.status !== 'DONE';
    }), [planningEvents, selectedDate]);

    // All active (non-DONE) events for clôture
    const activeEvents = useMemo(() => planningEvents.filter(e => e.status !== 'DONE'), [planningEvents]);

    const handleSendDemande = () => {
        if (!demandeOF || !demandeArticle || demandeQty <= 0) {
            alert(tx(lang, { fr: "Veuillez remplir l'OF, l'article et la quantité.", ar: 'يرجى تعبئة OF، المادة والكمية.', en: 'Please fill in the OF, article and quantity.', es: 'Por favor complete el OF, el artículo y la cantidad.', pt: 'Por favor, preencha a OF, o artigo e a quantidade.', tr: "Lütfen OF, ürün ve miktarı doldurun." }));
            return;
        }
        const plan = planningEvents.find(p => p.id === demandeOF);
        handleAddDemandeAppro({
            modelId: plan?.modelId || '',
            chaineId: plan?.chaineId || '',
            produitDesignation: demandeArticle,
            quantiteDemandee: demandeQty,
            demandeur: demandeDemandeur || 'Atelier',
            notes: demandeMotif
        });
        setDemandeSent(true);
        setTimeout(() => {
            setDemandeSent(false);
            setDemandeOF('');
            setDemandeArticle('');
            setDemandeQty(0);
            setDemandeDemandeur('');
            setDemandeMotif('');
        }, 2000);
    };

    const handleClotureOF = async () => {
        if (!clotureOF) {
            alert(tx(lang, { fr: 'Veuillez sélectionner un OF à clôturer.', ar: 'يرجى تحديد OF لإغلاقه.', en: 'Please select an OF to close.', es: 'Por favor seleccione un OF para cerrar.', pt: 'Por favor, selecione uma OF para encerrar.', tr: 'Lütfen kapatılacak bir OF seçin.' }));
            return;
        }
        if (piecesBonnes <= 0) {
            alert(tx(lang, { fr: 'Veuillez saisir le nombre de pièces bonnes.', ar: 'يرجى إدخال عدد القطع الجيدة.', en: 'Please enter the number of good pieces.', es: 'Por favor ingrese el número de piezas buenas.', pt: 'Por favor, insira o número de peças boas.', tr: 'Lütfen iyi parça sayısını girin.' }));
            return;
        }

        const plan = planningEvents.find(p => p.id === clotureOF);
        if (!plan) return;

        // 1. Set PlanningEvent status to DONE
        setPlanningEvents(prev => prev.map(p =>
            p.id === clotureOF ? { ...p, status: 'DONE' as const } : p
        ));

        // 2. Set ModelData workflowStatus to EXPORT
        setModels(prev => prev.map(m =>
            m.id === plan.modelId ? { ...m, workflowStatus: 'EXPORT' as const } : m
        ));

        // 3. Create finished goods stock entry via API
        try {
            const model = models.find(m => m.id === plan.modelId);
            await fetch('/api/finished-goods/cloture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    planningId: plan.id,
                    modelId: plan.modelId,
                    reference: model?.meta_data?.reference || plan.modelName || '',
                    designation: model?.meta_data?.nom_modele || plan.modelName || '',
                    clientName: plan.clientName || '',
                    chaineId: plan.chaineId,
                    quantiteProduite: piecesBonnes,
                    quantiteDefaut: piecesRebut,
                    dateExportPrevue: plan.dateExport || '',
                    notes: `Clôture OF — ${heuresProduction}h de production`
                })
            });
        } catch (e) {
            console.error("Failed to create finished goods entry", e);
        }

        // 4. Push retours back to Magasin stock (via localStorage)
        const validRetours = retourLines.filter(r => r.ref.trim() && r.qty > 0);
        if (validRetours.length > 0) {
            try {
                const magStr = localStorage.getItem('beramethode_magasin');
                let magItems = magStr ? JSON.parse(magStr) : [];
                validRetours.forEach(retour => {
                    const existingIdx = magItems.findIndex((i: any) =>
                        i.nom === retour.ref || i.designation === retour.ref
                    );
                    if (existingIdx >= 0) {
                        magItems[existingIdx].stockActuel = (magItems[existingIdx].stockActuel || 0) + retour.qty;
                        // Add mouvement
                        if (!magItems[existingIdx].mouvements) magItems[existingIdx].mouvements = [];
                        magItems[existingIdx].mouvements.push({
                            id: `MVT-${Date.now()}`,
                            date: new Date().toISOString(),
                            type: 'retour_atelier',
                            quantite: retour.qty,
                            reference: `Retour OF-${clotureOF.substring(0, 8)}`,
                            responsable: 'Atelier'
                        });
                    }
                });
                localStorage.setItem('beramethode_magasin', JSON.stringify(magItems));
            } catch (e) {
                console.error("Failed to update Magasin stock with retours", e);
            }
        }

        setClotureDone(true);
        setTimeout(() => {
            setClotureDone(false);
            setClotureOF('');
            setPiecesBonnes(0);
            setPiecesRebut(0);
            setHeuresProduction(0);
            setRetourLines([{ ref: '', qty: 0 }]);
        }, 3000);
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-dk-bg relative pb-20">
            {/* Header */}
            <div className="bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-20">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-dk-text tracking-tight flex items-center gap-2">
                        <Factory className="w-6 h-6 text-orange-500" />
                        {tx(lang, { fr: 'Atelier de Production', ar: 'ورشة الإنتاج', en: 'Production Workshop', es: 'Taller de Producción', pt: 'Oficina de Produção', tr: 'Üretim Atölyesi' })}
                    </h1>
                    <p className="text-slate-500 dark:text-dk-text-soft mt-1">{tx(lang, { fr: "Interface Chef d'Atelier : Planning du jour, Demandes Magasin, Clôtures d'OF.", ar: 'واجهة رئيس الورشة: تخطيط اليوم، طلبات المخزن، إغلاق OF.', en: "Workshop Manager Interface: Today's planning, Warehouse requests, OF closures.", es: 'Interfaz del Jefe de Taller: Planificación del día, Solicitudes de Almacén, Cierres de OF.', pt: 'Interface do Chefe de Oficina: Planejamento do dia, Solicitações de Armazém, Encerramentos de OF.', tr: 'Atölye Şefi Arayüzü: Günün planlaması, Depo talepleri, OF kapatmaları.' })}</p>
                </div>
                <div className="flex items-center gap-4">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        className="bg-slate-50 dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-2 text-sm font-bold text-slate-700 dark:text-dk-text outline-none focus:border-orange-500"
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white dark:bg-dk-surface px-6 border-b flex gap-6 shrink-0 z-0 border-slate-200 dark:border-dk-border overflow-x-auto hide-scrollbar">
                {[
                    { id: 'dashboard', label: tx(lang, { fr: "Dashboard (Aujourd'hui)", ar: 'لوحة القيادة (اليوم)', en: 'Dashboard (Today)', es: 'Panel (Hoy)', pt: 'Painel (Hoje)', tr: 'Gösterge Paneli (Bugün)' }), icon: Calendar },
                    { id: 'demandes', label: tx(lang, { fr: 'Demandes Matière', ar: 'طلبات المواد', en: 'Material Requests', es: 'Solicitudes de Material', pt: 'Solicitações de Material', tr: 'Malzeme Talepleri' }), icon: Package },
                    { id: 'cloture', label: tx(lang, { fr: 'Clôture & Retours', ar: 'الإغلاق والمرتجعات', en: 'Closure & Returns', es: 'Cierre y Devoluciones', pt: 'Encerramento e Devoluções', tr: 'Kapatma ve İadeler' }), icon: CheckSquare }
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id as any)}
                        className={`py-3 text-sm font-bold flex items-center gap-2 relative transition-colors whitespace-nowrap ${tab === t.id ? 'text-orange-600' : 'text-slate-500 dark:text-dk-text-soft hover:text-slate-800 dark:hover:text-dk-text'}`}
                    >
                        <t.icon className="w-4 h-4" />{t.label}
                        {tab === t.id && <div className="absolute bottom-0 inset-x-0 h-1 bg-orange-600 rounded-t-full" />}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto w-full max-w-[1400px] mx-auto p-4 md:p-6">

                {/* ══ Dashboard ══ */}
                {tab === 'dashboard' && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                                    <Factory className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500 dark:text-dk-text-soft">{tx(lang, { fr: 'OF en cours', ar: 'OF قيد التنفيذ', en: 'OF in progress', es: 'OF en curso', pt: 'OF em andamento', tr: 'Devam eden OF' })}</p>
                                    <p className="text-3xl font-black text-slate-800 dark:text-dk-text">{todayEvents.length}</p>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                    <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500 dark:text-dk-text-soft">{tx(lang, { fr: 'Total Pièces Prévues', ar: 'إجمالي القطع المخططة', en: 'Total Planned Pieces', es: 'Total Piezas Previstas', pt: 'Total de Peças Previstas', tr: 'Toplam Planlanan Parça' })}</p>
                                    <p className="text-3xl font-black text-slate-800 dark:text-dk-text">{todayEvents.reduce((s, e) => s + e.qteTotal, 0).toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                                    <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500 dark:text-dk-text-soft">{tx(lang, { fr: 'OF Terminés (Total)', ar: 'OF منتهية (الإجمالي)', en: 'Completed OF (Total)', es: 'OF Terminadas (Total)', pt: 'OF Concluídas (Total)', tr: 'Tamamlanan OF (Toplam)' })}</p>
                                    <p className="text-3xl font-black text-slate-800 dark:text-dk-text">{planningEvents.filter(e => e.status === 'DONE').length}</p>
                                </div>
                            </div>
                        </div>

                        <h3 className="text-lg font-black text-slate-800 dark:text-dk-text mb-4 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-orange-500" /> {tx(lang, { fr: 'Programme du', ar: 'برنامج يوم', en: 'Schedule for', es: 'Programa del', pt: 'Programa do dia', tr: 'Program' })} {new Date(selectedDate).toLocaleDateString('fr-FR')}
                        </h3>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {todayEvents.length === 0 ? (
                                <div className="col-span-full py-12 text-center bg-white dark:bg-dk-surface rounded-3xl border border-slate-200 dark:border-dk-border border-dashed">
                                    <FileText className="w-12 h-12 text-slate-300 dark:text-dk-muted mx-auto mb-3" />
                                    <p className="text-slate-500 dark:text-dk-text-soft font-bold">{tx(lang, { fr: 'Aucun lancement prévu pour cette journée.', ar: 'لا يوجد إطلاق مبرمج لهذا اليوم.', en: 'No launch scheduled for this day.', es: 'Ningún lanzamiento previsto para este día.', pt: 'Nenhum lançamento previsto para este dia.', tr: 'Bu gün için planlanmış bir başlatma yok.' })}</p>
                                </div>
                            ) : (
                                todayEvents.map(evt => {
                                    const model = models.find(m => m.id === evt.modelId);
                                    const mName = model?.meta_data?.nom_modele || tx(lang, { fr: 'Modèle Introuvable', ar: 'النموذج غير موجود', en: 'Model Not Found', es: 'Modelo No Encontrado', pt: 'Modelo Não Encontrado', tr: 'Model Bulunamadı' });
                                    // Real progress from suivi
                                    const evtSuivis = suivis.filter(s => s.planningId === evt.id);
                                    const totalProduced = evtSuivis.reduce((acc, s) => acc + (s.totalHeure || 0), 0);
                                    const progress = evt.qteTotal > 0 ? Math.min(100, Math.round((totalProduced / evt.qteTotal) * 100)) : 0;

                                    return (
                                        <div key={evt.id} className="bg-white dark:bg-dk-surface rounded-3xl p-6 border border-slate-200 dark:border-dk-border shadow-sm flex flex-col hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-16 bg-slate-100 dark:bg-dk-elevated/60 rounded-xl overflow-hidden shrink-0">
                                                        {model?.meta_data?.photo_url || model?.image ? (
                                                            <img src={model?.meta_data?.photo_url || model?.image || ''} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <Package className="w-6 h-6 text-slate-400 dark:text-dk-muted m-3" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-black px-2 py-0.5 rounded uppercase inline-block mb-1">
                                                            {settings.chainNames?.[evt.chaineId] || evt.chaineId}
                                                        </div>
                                                        <h4 className="font-black text-lg text-slate-800 dark:text-dk-text leading-tight">{mName}</h4>
                                                        <p className="text-xs text-slate-500 dark:text-dk-text-soft font-bold">{evt.qteTotal.toLocaleString()} pcs • OF-{evt.id.substring(0, 6)}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-auto">
                                                <div className="flex justify-between text-xs font-bold mb-1">
                                                    <span className="text-slate-500 dark:text-dk-text-soft">{tx(lang, { fr: 'Avancement', ar: 'التقدّم', en: 'Progress', es: 'Progreso', pt: 'Progresso', tr: 'İlerleme' })} ({totalProduced}/{evt.qteTotal})</span>
                                                    <span className={`${progress >= 80 ? 'text-emerald-600 dark:text-emerald-400' : progress >= 40 ? 'text-orange-600 dark:text-orange-400' : 'text-rose-600 dark:text-rose-400'}`}>{progress}%</span>
                                                </div>
                                                <div className="w-full bg-slate-100 dark:bg-dk-elevated/60 h-2 rounded-full overflow-hidden">
                                                    <div className={`h-full transition-all duration-500 ${progress >= 80 ? 'bg-emerald-500' : progress >= 40 ? 'bg-orange-500' : 'bg-rose-500'}`} style={{ width: `${progress}%` }}></div>
                                                </div>
                                            </div>

                                            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-dk-border flex gap-2">
                                                <button onClick={() => { setTab('demandes'); setDemandeOF(evt.id); }} className="flex-1 bg-slate-50 dark:bg-dk-elevated/60 hover:bg-slate-100 dark:hover:bg-dk-elevated text-slate-700 dark:text-dk-text font-bold text-xs py-2 rounded-xl transition-colors border border-slate-200 dark:border-dk-border flex items-center justify-center gap-1">
                                                    <Plus className="w-3.5 h-3.5" /> {tx(lang, { fr: 'Demander Matière', ar: 'طلب مادة', en: 'Request Material', es: 'Solicitar Material', pt: 'Solicitar Material', tr: 'Malzeme Talep Et' })}
                                                </button>
                                                <button onClick={() => { setTab('cloture'); setClotureOF(evt.id); }} className="flex-1 bg-slate-800 dark:bg-dk-accent hover:bg-slate-700 dark:hover:bg-green-600 text-white font-bold text-xs py-2 rounded-xl transition-colors flex items-center justify-center gap-1">
                                                    <CheckSquare className="w-3.5 h-3.5" /> {tx(lang, { fr: 'Clôture Rapide', ar: 'إغلاق سريع', en: 'Quick Closure', es: 'Cierre Rápido', pt: 'Encerramento Rápido', tr: 'Hızlı Kapatma' })}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* ══ Demandes Magasin ══ */}
                {tab === 'demandes' && (
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                        <div className="bg-white dark:bg-dk-surface p-8 rounded-3xl border dark:border-dk-border shadow-sm max-w-2xl mx-auto">
                            <h2 className="text-2xl font-black text-slate-800 dark:text-dk-text mb-6 flex items-center gap-3">
                                <Package className="w-6 h-6 text-indigo-500" /> {tx(lang, { fr: "Nouvelle Demande d'Appro", ar: 'طلب توريد جديد', en: 'New Supply Request', es: 'Nueva Solicitud de Suministro', pt: 'Novo Pedido de Abastecimento', tr: 'Yeni Tedarik Talebi' })}
                            </h2>
                            <p className="text-slate-500 dark:text-dk-text-soft font-bold text-sm mb-6">{tx(lang, { fr: 'Créez un ticket pour demander de la matière supplémentaire au magasin de manière tracée.', ar: 'أنشئ تذكرة لطلب مواد إضافية من المخزن بشكل متتبَّع.', en: 'Create a ticket to request additional material from the warehouse in a tracked way.', es: 'Cree un ticket para solicitar material adicional al almacén de forma trazable.', pt: 'Crie um chamado para solicitar material adicional ao armazém de forma rastreável.', tr: 'Depodan ek malzeme talep etmek için izlenebilir bir talep oluşturun.' })}</p>

                            {demandeSent ? (
                                <div className="py-12 text-center">
                                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                                    <p className="text-2xl font-black text-emerald-700">{tx(lang, { fr: 'Demande envoyée !', ar: 'تم إرسال الطلب!', en: 'Request sent!', es: '¡Solicitud enviada!', pt: 'Pedido enviado!', tr: 'Talep gönderildi!' })}</p>
                                    <p className="text-slate-500 dark:text-dk-text-soft font-bold mt-2">{tx(lang, { fr: 'Le magasinier a reçu votre demande et peut la valider depuis son module.', ar: 'استلم أمين المخزن طلبك ويمكنه التحقق منه من وحدته.', en: 'The storekeeper has received your request and can validate it from their module.', es: 'El almacenero recibió su solicitud y puede validarla desde su módulo.', pt: 'O almoxarife recebeu seu pedido e pode validá-lo em seu módulo.', tr: 'Depo sorumlusu talebinizi aldı ve kendi modülünden onaylayabilir.' })}</p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-dk-text-soft uppercase tracking-widest mb-1.5">{tx(lang, { fr: "Pour l'OF / Modèle", ar: 'لأجل OF / النموذج', en: 'For the OF / Model', es: 'Para el OF / Modelo', pt: 'Para a OF / Modelo', tr: 'OF / Model için' })} *</label>
                                        <select
                                            value={demandeOF}
                                            onChange={e => setDemandeOF(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 font-bold text-slate-700 dark:text-dk-text outline-none focus:border-indigo-500"
                                        >
                                            <option value="">{tx(lang, { fr: "Sélectionner l'OF en cours...", ar: 'حدّد OF الجاري...', en: 'Select the current OF...', es: 'Seleccionar el OF en curso...', pt: 'Selecionar a OF em andamento...', tr: 'Devam eden OF seçin...' })}</option>
                                            {activeEvents.map(e => (
                                                <option key={e.id} value={e.id}>
                                                    {models.find(m => m.id === e.modelId)?.meta_data?.nom_modele || tx(lang, { fr: 'Modèle', ar: 'النموذج', en: 'Model', es: 'Modelo', pt: 'Modelo', tr: 'Model' })} ({settings.chainNames?.[e.chaineId] || e.chaineId})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-dk-text-soft uppercase tracking-widest mb-1.5">{tx(lang, { fr: 'Article Demandé (Référence Magasin)', ar: 'المادة المطلوبة (مرجع المخزن)', en: 'Requested Article (Warehouse Reference)', es: 'Artículo Solicitado (Referencia de Almacén)', pt: 'Artigo Solicitado (Referência de Armazém)', tr: 'Talep Edilen Ürün (Depo Referansı)' })} *</label>
                                        <input
                                            type="text"
                                            value={demandeArticle}
                                            onChange={e => setDemandeArticle(e.target.value)}
                                            placeholder={tx(lang, { fr: 'Ex: Fil de couture Noir 120, Zip 15cm...', ar: 'مثال: خيط حياكة أسود 120، سحاب 15 سم...', en: 'E.g.: Black sewing thread 120, Zip 15cm...', es: 'Ej: Hilo de costura Negro 120, Cremallera 15cm...', pt: 'Ex: Fio de costura Preto 120, Zíper 15cm...', tr: 'Örn: Siyah dikiş ipliği 120, Fermuar 15cm...' })}
                                            className="w-full bg-slate-50 dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 font-medium text-slate-700 dark:text-dk-text outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 dark:text-dk-text-soft uppercase tracking-widest mb-1.5">{tx(lang, { fr: 'Quantité', ar: 'الكمية', en: 'Quantity', es: 'Cantidad', pt: 'Quantidade', tr: 'Miktar' })} *</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={demandeQty || ''}
                                                onChange={e => setDemandeQty(parseInt(e.target.value) || 0)}
                                                placeholder={tx(lang, { fr: 'Ex: 50', ar: 'مثال: 50', en: 'E.g.: 50', es: 'Ej: 50', pt: 'Ex: 50', tr: 'Örn: 50' })}
                                                className="w-full bg-slate-50 dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 font-black text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 dark:text-dk-text-soft uppercase tracking-widest mb-1.5">{tx(lang, { fr: 'Demandeur', ar: 'الطالب', en: 'Requester', es: 'Solicitante', pt: 'Solicitante', tr: 'Talep Eden' })}</label>
                                            <input
                                                type="text"
                                                value={demandeDemandeur}
                                                onChange={e => setDemandeDemandeur(e.target.value)}
                                                placeholder={tx(lang, { fr: 'Nom du Chef', ar: 'اسم الرئيس', en: 'Manager Name', es: 'Nombre del Jefe', pt: 'Nome do Chefe', tr: 'Şef Adı' })}
                                                className="w-full bg-slate-50 dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 font-bold text-slate-700 dark:text-dk-text outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 dark:text-dk-text-soft uppercase tracking-widest mb-1.5">{tx(lang, { fr: 'Motif / Note', ar: 'السبب / ملاحظة', en: 'Reason / Note', es: 'Motivo / Nota', pt: 'Motivo / Nota', tr: 'Sebep / Not' })}</label>
                                        <textarea
                                            value={demandeMotif}
                                            onChange={e => setDemandeMotif(e.target.value)}
                                            placeholder={tx(lang, { fr: 'Ex: Chutes de coupe, Quantité initiale insuffisante...', ar: 'مثال: نفايات القص، الكمية الأولية غير كافية...', en: 'E.g.: Cutting waste, Initial quantity insufficient...', es: 'Ej: Recortes de corte, Cantidad inicial insuficiente...', pt: 'Ex: Resíduos de corte, Quantidade inicial insuficiente...', tr: 'Örn: Kesim fireleri, İlk miktar yetersiz...' })}
                                            className="w-full bg-slate-50 dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 font-medium text-slate-700 dark:text-dk-text outline-none focus:border-indigo-500 h-24 resize-none"
                                        />
                                    </div>
                                    <div className="pt-4">
                                        <button
                                            onClick={handleSendDemande}
                                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 flex items-center justify-center gap-2"
                                        >
                                            <Send className="w-5 h-5" /> {tx(lang, { fr: 'Envoyer la Demande au Magasin', ar: 'إرسال الطلب إلى المخزن', en: 'Send Request to Warehouse', es: 'Enviar Solicitud al Almacén', pt: 'Enviar Pedido ao Armazém', tr: 'Talebi Depoya Gönder' })}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ══ Clôture & Retours ══ */}
                {tab === 'cloture' && (
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                        <div className="bg-white dark:bg-dk-surface p-8 rounded-3xl border dark:border-dk-border shadow-sm max-w-3xl mx-auto border-t-4 border-t-rose-500">
                            <h2 className="text-2xl font-black text-slate-800 dark:text-dk-text mb-2 flex items-center gap-3">
                                <AlertCircle className="w-6 h-6 text-rose-500" /> {tx(lang, { fr: 'Clôture de Lancement (OF)', ar: 'إغلاق الإطلاق (OF)', en: 'Launch Closure (OF)', es: 'Cierre de Lanzamiento (OF)', pt: 'Encerramento de Lançamento (OF)', tr: 'Başlatma Kapatma (OF)' })}
                            </h2>
                            <p className="text-slate-500 dark:text-dk-text-soft font-bold text-sm mb-8">{tx(lang, { fr: "Déclarez la fin de production d'un OF pour mettre à jour les stocks finis et retourner les excédents matières au Magasin.", ar: 'صرّح بانتهاء إنتاج OF لتحديث المخزون الجاهز وإرجاع فائض المواد إلى المخزن.', en: 'Declare the end of production of an OF to update finished stocks and return material surpluses to the warehouse.', es: 'Declare el fin de producción de un OF para actualizar los stocks terminados y devolver los excedentes de material al Almacén.', pt: 'Declare o fim da produção de uma OF para atualizar os estoques finalizados e devolver os excedentes de material ao Armazém.', tr: 'Bitmiş stokları güncellemek ve fazla malzemeyi depoya geri göndermek için bir OF üretiminin sona erdiğini bildirin.' })}</p>

                            {clotureDone ? (
                                <div className="py-12 text-center">
                                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                                    <p className="text-2xl font-black text-emerald-700">{tx(lang, { fr: 'OF Clôturé avec succès !', ar: 'تم إغلاق OF بنجاح!', en: 'OF Closed successfully!', es: '¡OF Cerrada con éxito!', pt: 'OF Encerrada com sucesso!', tr: 'OF başarıyla kapatıldı!' })}</p>
                                    <p className="text-slate-500 dark:text-dk-text-soft font-bold mt-2">{tx(lang, { fr: 'Le statut a été mis à jour, les retours matière ont été enregistrés dans le Magasin.', ar: 'تم تحديث الحالة، وتم تسجيل مرتجعات المواد في المخزن.', en: 'The status has been updated, the material returns have been recorded in the Warehouse.', es: 'El estado ha sido actualizado, las devoluciones de material han sido registradas en el Almacén.', pt: 'O status foi atualizado, as devoluções de material foram registradas no Armazém.', tr: 'Durum güncellendi, malzeme iadeleri Depoya kaydedildi.' })}</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-dk-text uppercase tracking-widest mb-2">{tx(lang, { fr: "1. Sélectionner l'OF à clôturer", ar: '1. حدّد OF لإغلاقه', en: '1. Select the OF to close', es: '1. Seleccionar el OF a cerrar', pt: '1. Selecionar a OF a encerrar', tr: '1. Kapatılacak OF\'yi seçin' })}</label>
                                        <select
                                            value={clotureOF}
                                            onChange={e => setClotureOF(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 font-bold text-slate-700 dark:text-dk-text outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 dark:focus:ring-rose-900/30 transition-all"
                                        >
                                            <option value="">{tx(lang, { fr: 'Sélectionner...', ar: 'اختر...', en: 'Select...', es: 'Seleccionar...', pt: 'Selecionar...', tr: 'Seçin...' })}</option>
                                            {activeEvents.map(e => (
                                                <option key={e.id} value={e.id}>
                                                    OF-{e.id.substring(0, 8)} : {models.find(m => m.id === e.modelId)?.meta_data?.nom_modele || tx(lang, { fr: 'Modèle', ar: 'النموذج', en: 'Model', es: 'Modelo', pt: 'Modelo', tr: 'Model' })} ({e.qteTotal} pcs)
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6 p-6 bg-slate-50 dark:bg-dk-elevated/60 rounded-2xl border border-slate-200 dark:border-dk-border">
                                        <div>
                                            <label className="block text-xs font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest mb-2">{tx(lang, { fr: 'Pièces Bonnes (1er Choix)', ar: 'القطع الجيدة (الاختيار الأول)', en: 'Good Pieces (1st Choice)', es: 'Piezas Buenas (1ª Calidad)', pt: 'Peças Boas (1ª Escolha)', tr: 'İyi Parçalar (1. Seçim)' })}</label>
                                            <input
                                                type="number"
                                                value={piecesBonnes || ''}
                                                onChange={e => setPiecesBonnes(parseInt(e.target.value) || 0)}
                                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 font-black text-3xl text-emerald-600 dark:text-emerald-400 outline-none focus:border-emerald-400 text-center"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-amber-700 dark:text-amber-300 uppercase tracking-widest mb-2">{tx(lang, { fr: 'Rebuts / 2ème Choix', ar: 'النفايات / الاختيار الثاني', en: 'Rejects / 2nd Choice', es: 'Rechazos / 2ª Calidad', pt: 'Rejeitos / 2ª Escolha', tr: 'Hurda / 2. Seçim' })}</label>
                                            <input
                                                type="number"
                                                value={piecesRebut || ''}
                                                onChange={e => setPiecesRebut(parseInt(e.target.value) || 0)}
                                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 font-black text-3xl text-amber-600 dark:text-amber-400 outline-none focus:border-amber-400 text-center"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                                        <h3 className="font-black text-indigo-800 dark:text-indigo-300 text-sm mb-4 uppercase tracking-widest flex items-center gap-2">
                                            <Clock className="w-4 h-4" /> {tx(lang, { fr: 'Durée de Production Réelle', ar: 'مدة الإنتاج الفعلية', en: 'Actual Production Duration', es: 'Duración Real de Producción', pt: 'Duração Real de Produção', tr: 'Gerçek Üretim Süresi' })}
                                        </h3>
                                        <div className="flex gap-4 items-center">
                                            <input
                                                type="number"
                                                value={heuresProduction || ''}
                                                onChange={e => setHeuresProduction(parseInt(e.target.value) || 0)}
                                                placeholder={tx(lang, { fr: 'Ex: 48', ar: 'مثال: 48', en: 'E.g.: 48', es: 'Ej: 48', pt: 'Ex: 48', tr: 'Örn: 48' })}
                                                className="bg-white dark:bg-dk-surface border border-indigo-200 dark:border-indigo-900/30 rounded-xl px-4 py-2 font-black text-indigo-700 dark:text-indigo-300 w-32 outline-none text-center text-xl"
                                            />
                                            <span className="font-bold text-indigo-600 dark:text-indigo-400">{tx(lang, { fr: 'Heures de travail (par O. direct)', ar: 'ساعات العمل (يدوي مباشر)', en: 'Work hours (direct labor)', es: 'Horas de trabajo (mano de obra directa)', pt: 'Horas de trabalho (mão de obra direta)', tr: 'Çalışma saatleri (doğrudan işçilik)' })}</span>
                                        </div>
                                    </div>

                                    <div className="p-6 border-2 border-dashed border-slate-200 dark:border-dk-border rounded-2xl">
                                        <h3 className="font-black text-slate-800 dark:text-dk-text text-sm mb-4 uppercase tracking-widest flex items-center justify-between">
                                            <span>{tx(lang, { fr: 'Retours Magasin (Matière non consommée)', ar: 'مرتجعات المخزن (المواد غير المستهلكة)', en: 'Warehouse Returns (Unconsumed Material)', es: 'Devoluciones de Almacén (Material no consumido)', pt: 'Devoluções de Armazém (Material não consumido)', tr: 'Depo İadeleri (Kullanılmayan Malzeme)' })}</span>
                                            <button
                                                onClick={() => setRetourLines(prev => [...prev, { ref: '', qty: 0 }])}
                                                className="text-xs font-bold bg-slate-100 dark:bg-dk-elevated/60 hover:bg-slate-200 dark:hover:bg-dk-elevated text-slate-700 dark:text-dk-text px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
                                            >
                                                + {tx(lang, { fr: 'Ajouter Ligne', ar: 'إضافة سطر', en: 'Add Line', es: 'Añadir Línea', pt: 'Adicionar Linha', tr: 'Satır Ekle' })}
                                            </button>
                                        </h3>
                                        <p className="text-xs font-bold text-slate-400 dark:text-dk-muted mb-4">{tx(lang, { fr: 'Déclarez ici les bobines de fils, accessoires excédentaires pour qu\'ils retournent dans le WMS Magasin et n\'impactent pas le coût de revient final de l\'OF.', ar: 'صرّح هنا ببكرات الخيوط والإكسسوارات الفائضة لإرجاعها إلى WMS المخزن وعدم تأثيرها على التكلفة النهائية للOF.', en: 'Declare here the surplus thread spools and accessories so they return to the warehouse WMS and do not impact the final cost price of the OF.', es: 'Declare aquí las bobinas de hilo y accesorios excedentes para que regresen al WMS del Almacén y no impacten el costo final del OF.', pt: 'Declare aqui as bobinas de fio e acessórios excedentes para que retornem ao WMS do Armazém e não impactem o custo final da OF.', tr: 'OF\'nin nihai maliyetini etkilememesi için depo WMS\'sine geri dönmesi gereken fazla iplik makaralarını ve aksesuarları buraya bildirin.' })}</p>

                                        {retourLines.map((line, idx) => (
                                            <div key={idx} className="flex gap-2 items-center mb-2">
                                                <input
                                                    type="text"
                                                    value={line.ref}
                                                    onChange={e => setRetourLines(prev => prev.map((l, i) => i === idx ? { ...l, ref: e.target.value } : l))}
                                                    placeholder={tx(lang, { fr: 'Réf Matière', ar: 'مرجع المادة', en: 'Material Ref', es: 'Ref Material', pt: 'Ref Material', tr: 'Malzeme Ref' })}
                                                    className="flex-1 bg-slate-50 dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-bold text-slate-700 dark:text-dk-text outline-none"
                                                />
                                                <input
                                                    type="number"
                                                    value={line.qty || ''}
                                                    onChange={e => setRetourLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: parseInt(e.target.value) || 0 } : l))}
                                                    placeholder={tx(lang, { fr: 'Qté', ar: 'الكمية', en: 'Qty', es: 'Cant.', pt: 'Qtd', tr: 'Adet' })}
                                                    className="w-24 bg-slate-50 dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-black text-center text-slate-700 dark:text-dk-text outline-none"
                                                />
                                                {retourLines.length > 1 && (
                                                    <button
                                                        onClick={() => setRetourLines(prev => prev.filter((_, i) => i !== idx))}
                                                        className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="pt-4">
                                        <button
                                            onClick={handleClotureOF}
                                            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-rose-200 dark:shadow-rose-900/30 flex items-center justify-center gap-2"
                                        >
                                            <CheckSquare className="w-5 h-5" /> {tx(lang, { fr: "Validation Définitive de l'OF", ar: 'التصديق النهائي على OF', en: 'Final Validation of the OF', es: 'Validación Definitiva del OF', pt: 'Validação Definitiva da OF', tr: 'OF\'nin Nihai Onayı' })}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
