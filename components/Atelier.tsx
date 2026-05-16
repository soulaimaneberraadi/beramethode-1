import React, { useState, useEffect, useMemo } from 'react';
import { ModelData, PlanningEvent, MouvementStock, DemandeAppro, SuiviData, AppSettings } from '../types';
import { Factory, Calendar, Package, CheckSquare, Plus, AlertCircle, Clock, ChevronRight, Search, FileText, Send, ArrowLeft, Trash2, CheckCircle2, XCircle } from 'lucide-react';

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
            alert("Veuillez remplir l'OF, l'article et la quantité.");
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

    const handleClotureOF = () => {
        if (!clotureOF) {
            alert("Veuillez sélectionner un OF à clôturer.");
            return;
        }
        if (piecesBonnes <= 0) {
            alert("Veuillez saisir le nombre de pièces bonnes.");
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

        // 3. Push retours back to Magasin stock (via localStorage)
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
        <div className="h-full flex flex-col bg-slate-50 relative pb-20">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-20">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <Factory className="w-6 h-6 text-orange-500" />
                        Atelier de Production
                    </h1>
                    <p className="text-slate-500 mt-1">Interface Chef d'Atelier : Planning du jour, Demandes Magasin, Clôtures d'OF.</p>
                </div>
                <div className="flex items-center gap-4">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:border-orange-500"
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white px-6 border-b flex gap-6 shrink-0 z-0 border-slate-200 overflow-x-auto hide-scrollbar">
                {[
                    { id: 'dashboard', label: 'Dashboard (Aujourd\'hui)', icon: Calendar },
                    { id: 'demandes', label: 'Demandes Matière', icon: Package },
                    { id: 'cloture', label: 'Clôture & Retours', icon: CheckSquare }
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id as any)}
                        className={`py-3 text-sm font-bold flex items-center gap-2 relative transition-colors whitespace-nowrap ${tab === t.id ? 'text-orange-600' : 'text-slate-500 hover:text-slate-800'}`}
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
                            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                                    <Factory className="w-6 h-6 text-orange-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500">OF en cours</p>
                                    <p className="text-3xl font-black text-slate-800">{todayEvents.length}</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                    <Package className="w-6 h-6 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500">Total Pièces Prévues</p>
                                    <p className="text-3xl font-black text-slate-800">{todayEvents.reduce((s, e) => s + e.qteTotal, 0).toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500">OF Terminés (Total)</p>
                                    <p className="text-3xl font-black text-slate-800">{planningEvents.filter(e => e.status === 'DONE').length}</p>
                                </div>
                            </div>
                        </div>

                        <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-orange-500" /> Programme du {new Date(selectedDate).toLocaleDateString('fr-FR')}
                        </h3>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {todayEvents.length === 0 ? (
                                <div className="col-span-full py-12 text-center bg-white rounded-3xl border border-slate-200 border-dashed">
                                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                    <p className="text-slate-500 font-bold">Aucun lancement prévu pour cette journée.</p>
                                </div>
                            ) : (
                                todayEvents.map(evt => {
                                    const model = models.find(m => m.id === evt.modelId);
                                    const mName = model?.meta_data.nom_modele || 'Modèle Introuvable';
                                    // Real progress from suivi
                                    const evtSuivis = suivis.filter(s => s.planningId === evt.id);
                                    const totalProduced = evtSuivis.reduce((acc, s) => acc + (s.totalHeure || 0), 0);
                                    const progress = evt.qteTotal > 0 ? Math.min(100, Math.round((totalProduced / evt.qteTotal) * 100)) : 0;

                                    return (
                                        <div key={evt.id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-16 bg-slate-100 rounded-xl overflow-hidden shrink-0">
                                                        {model?.meta_data.photo_url || model?.image ? (
                                                            <img src={model.meta_data.photo_url || model.image || ''} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <Package className="w-6 h-6 text-slate-400 m-3" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] bg-indigo-50 text-indigo-700 font-black px-2 py-0.5 rounded uppercase inline-block mb-1">
                                                            {settings.chainNames?.[evt.chaineId] || evt.chaineId}
                                                        </div>
                                                        <h4 className="font-black text-lg text-slate-800 leading-tight">{mName}</h4>
                                                        <p className="text-xs text-slate-500 font-bold">{evt.qteTotal.toLocaleString()} pcs • OF-{evt.id.substring(0, 6)}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-auto">
                                                <div className="flex justify-between text-xs font-bold mb-1">
                                                    <span className="text-slate-500">Avancement ({totalProduced}/{evt.qteTotal})</span>
                                                    <span className={`${progress >= 80 ? 'text-emerald-600' : progress >= 40 ? 'text-orange-600' : 'text-rose-600'}`}>{progress}%</span>
                                                </div>
                                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                                    <div className={`h-full transition-all duration-500 ${progress >= 80 ? 'bg-emerald-500' : progress >= 40 ? 'bg-orange-500' : 'bg-rose-500'}`} style={{ width: `${progress}%` }}></div>
                                                </div>
                                            </div>

                                            <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                                                <button onClick={() => { setTab('demandes'); setDemandeOF(evt.id); }} className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs py-2 rounded-xl transition-colors border border-slate-200 flex items-center justify-center gap-1">
                                                    <Plus className="w-3.5 h-3.5" /> Demander Matière
                                                </button>
                                                <button onClick={() => { setTab('cloture'); setClotureOF(evt.id); }} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-2 rounded-xl transition-colors flex items-center justify-center gap-1">
                                                    <CheckSquare className="w-3.5 h-3.5" /> Clôture Rapide
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
                        <div className="bg-white p-8 rounded-3xl border shadow-sm max-w-2xl mx-auto">
                            <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <Package className="w-6 h-6 text-indigo-500" /> Nouvelle Demande d'Appro
                            </h2>
                            <p className="text-slate-500 font-bold text-sm mb-6">Créez un ticket pour demander de la matière supplémentaire au magasin de manière tracée.</p>

                            {demandeSent ? (
                                <div className="py-12 text-center">
                                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                                    <p className="text-2xl font-black text-emerald-700">Demande envoyée !</p>
                                    <p className="text-slate-500 font-bold mt-2">Le magasinier a reçu votre demande et peut la valider depuis son module.</p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Pour l'OF / Modèle *</label>
                                        <select
                                            value={demandeOF}
                                            onChange={e => setDemandeOF(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-indigo-500"
                                        >
                                            <option value="">Sélectionner l'OF en cours...</option>
                                            {activeEvents.map(e => (
                                                <option key={e.id} value={e.id}>
                                                    {models.find(m => m.id === e.modelId)?.meta_data.nom_modele || 'Modèle'} ({settings.chainNames?.[e.chaineId] || e.chaineId})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Article Demandé (Référence Magasin) *</label>
                                        <input
                                            type="text"
                                            value={demandeArticle}
                                            onChange={e => setDemandeArticle(e.target.value)}
                                            placeholder="Ex: Fil de couture Noir 120, Zip 15cm..."
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-700 outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Quantité *</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={demandeQty || ''}
                                                onChange={e => setDemandeQty(parseInt(e.target.value) || 0)}
                                                placeholder="Ex: 50"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-black text-slate-800 outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Demandeur</label>
                                            <input
                                                type="text"
                                                value={demandeDemandeur}
                                                onChange={e => setDemandeDemandeur(e.target.value)}
                                                placeholder="Nom du Chef"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Motif / Note</label>
                                        <textarea
                                            value={demandeMotif}
                                            onChange={e => setDemandeMotif(e.target.value)}
                                            placeholder="Ex: Chutes de coupe, Quantité initiale insuffisante..."
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-700 outline-none focus:border-indigo-500 h-24 resize-none"
                                        />
                                    </div>
                                    <div className="pt-4">
                                        <button
                                            onClick={handleSendDemande}
                                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                                        >
                                            <Send className="w-5 h-5" /> Envoyer la Demande au Magasin
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
                        <div className="bg-white p-8 rounded-3xl border shadow-sm max-w-3xl mx-auto border-t-4 border-t-rose-500">
                            <h2 className="text-2xl font-black text-slate-800 mb-2 flex items-center gap-3">
                                <AlertCircle className="w-6 h-6 text-rose-500" /> Clôture de Lancement (OF)
                            </h2>
                            <p className="text-slate-500 font-bold text-sm mb-8">Déclarez la fin de production d'un OF pour mettre à jour les stocks finis et retourner les excédents matières au Magasin.</p>

                            {clotureDone ? (
                                <div className="py-12 text-center">
                                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                                    <p className="text-2xl font-black text-emerald-700">OF Clôturé avec succès !</p>
                                    <p className="text-slate-500 font-bold mt-2">Le statut a été mis à jour, les retours matière ont été enregistrés dans le Magasin.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-widest mb-2">1. Sélectionner l'OF à clôturer</label>
                                        <select
                                            value={clotureOF}
                                            onChange={e => setClotureOF(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition-all"
                                        >
                                            <option value="">Sélectionner...</option>
                                            {activeEvents.map(e => (
                                                <option key={e.id} value={e.id}>
                                                    OF-{e.id.substring(0, 8)} : {models.find(m => m.id === e.modelId)?.meta_data.nom_modele} ({e.qteTotal} pcs)
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6 p-6 bg-slate-50 rounded-2xl border border-slate-200">
                                        <div>
                                            <label className="block text-xs font-black text-emerald-700 uppercase tracking-widest mb-2">Pièces Bonnes (1er Choix)</label>
                                            <input
                                                type="number"
                                                value={piecesBonnes || ''}
                                                onChange={e => setPiecesBonnes(parseInt(e.target.value) || 0)}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-black text-3xl text-emerald-600 outline-none focus:border-emerald-400 text-center"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-amber-700 uppercase tracking-widest mb-2">Rebuts / 2ème Choix</label>
                                            <input
                                                type="number"
                                                value={piecesRebut || ''}
                                                onChange={e => setPiecesRebut(parseInt(e.target.value) || 0)}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-black text-3xl text-amber-600 outline-none focus:border-amber-400 text-center"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
                                        <h3 className="font-black text-indigo-800 text-sm mb-4 uppercase tracking-widest flex items-center gap-2">
                                            <Clock className="w-4 h-4" /> Durée de Production Réelle
                                        </h3>
                                        <div className="flex gap-4 items-center">
                                            <input
                                                type="number"
                                                value={heuresProduction || ''}
                                                onChange={e => setHeuresProduction(parseInt(e.target.value) || 0)}
                                                placeholder="Ex: 48"
                                                className="bg-white border border-indigo-200 rounded-xl px-4 py-2 font-black text-indigo-700 w-32 outline-none text-center text-xl"
                                            />
                                            <span className="font-bold text-indigo-600">Heures de travail (par O. direct)</span>
                                        </div>
                                    </div>

                                    <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl">
                                        <h3 className="font-black text-slate-800 text-sm mb-4 uppercase tracking-widest flex items-center justify-between">
                                            <span>Retours Magasin (Matière non consommée)</span>
                                            <button
                                                onClick={() => setRetourLines(prev => [...prev, { ref: '', qty: 0 }])}
                                                className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
                                            >
                                                + Ajouter Ligne
                                            </button>
                                        </h3>
                                        <p className="text-xs font-bold text-slate-400 mb-4">Déclarez ici les bobines de fils, accessoires excédentaires pour qu'ils retournent dans le WMS Magasin et n'impactent pas le coût de revient final de l'OF.</p>

                                        {retourLines.map((line, idx) => (
                                            <div key={idx} className="flex gap-2 items-center mb-2">
                                                <input
                                                    type="text"
                                                    value={line.ref}
                                                    onChange={e => setRetourLines(prev => prev.map((l, i) => i === idx ? { ...l, ref: e.target.value } : l))}
                                                    placeholder="Réf Matière"
                                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none"
                                                />
                                                <input
                                                    type="number"
                                                    value={line.qty || ''}
                                                    onChange={e => setRetourLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: parseInt(e.target.value) || 0 } : l))}
                                                    placeholder="Qté"
                                                    className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-black text-center outline-none"
                                                />
                                                {retourLines.length > 1 && (
                                                    <button
                                                        onClick={() => setRetourLines(prev => prev.filter((_, i) => i !== idx))}
                                                        className="text-rose-400 hover:text-rose-600 transition-colors"
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
                                            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-2"
                                        >
                                            <CheckSquare className="w-5 h-5" /> Validation Définitive de l'OF
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
