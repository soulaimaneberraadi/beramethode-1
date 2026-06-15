import React, { useState, useEffect } from 'react';
import { 
    FileText, Plus, Search, Filter, Printer, Download, Mail, 
    Trash2, Edit, ChevronRight, CheckCircle2, AlertCircle, XCircle,
    Building2, FileCheck2, Calculator, Receipt, Tag, ArrowRight
} from 'lucide-react';
import { Facture, FactureLigne, BonLivraison, Paiement } from '../types';

interface FacturationProps {
    t: (key: string) => string;
    lang: 'fr' | 'ar' | 'en';
}

export default function Facturation({ t, lang }: FacturationProps) {
    const [activeTab, setActiveTab] = useState<'ACHAT' | 'VENTE' | 'DEVIS' | 'BL'>('VENTE');
    const [factures, setFactures] = useState<Facture[]>([]);
    const [bonsLivraison, setBonsLivraison] = useState<BonLivraison[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadData();
    }, [activeTab]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            if (activeTab === 'BL') {
                const res = await fetch('/api/facturation/bl');
                const data = await res.json();
                setBonsLivraison(data);
            } else {
                const res = await fetch(`/api/facturation/factures?type=${activeTab}`);
                const data = await res.json();
                setFactures(data);
            }
        } catch (e) {
            console.error('Error loading facturation data', e);
        } finally {
            setIsLoading(false);
        }
    };

    const StatusBadge = ({ status }: { status: string }) => {
        const styles: Record<string, string> = {
            'BROUILLON': 'bg-gray-100 text-gray-700 border-gray-200',
            'ENVOYEE': 'bg-blue-50 text-blue-700 border-blue-200',
            'PAYEE': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'PARTIELLEMENT': 'bg-amber-50 text-amber-700 border-amber-200',
            'ANNULEE': 'bg-red-50 text-red-700 border-red-200',
            'ACCEPTE': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'REFUSE': 'bg-red-50 text-red-700 border-red-200',
            'PREPARE': 'bg-gray-100 text-gray-700 border-gray-200',
            'EXPEDIE': 'bg-blue-50 text-blue-700 border-blue-200',
            'LIVRE': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'RETOUR': 'bg-red-50 text-red-700 border-red-200'
        };
        return (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || styles['BROUILLON']}`}>
                {t(status)}
            </span>
        );
    };

    const renderFactureList = () => {
        const filtered = factures.filter(f => 
            f.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.tiers_nom.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4">N° Document</th>
                                <th className="px-6 py-4">{activeTab === 'ACHAT' ? 'Fournisseur' : 'Client'}</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Montant TTC</th>
                                <th className="px-6 py-4">Statut</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>Aucun document trouvé</p>
                                    </td>
                                </tr>
                            ) : filtered.map(f => (
                                <tr key={f.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4 font-medium text-slate-900">{f.numero}</td>
                                    <td className="px-6 py-4 text-slate-600">{f.tiers_nom}</td>
                                    <td className="px-6 py-4 text-slate-600">
                                        {new Date(f.date_facture).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 font-semibold text-slate-700">
                                        {f.total_ttc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} <span className="text-xs text-slate-400">MAD</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <StatusBadge status={f.statut} />
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                <Printer className="w-4 h-4" />
                                            </button>
                                            <button className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                                                <Edit className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderBLList = () => {
        const filtered = bonsLivraison.filter(bl => 
            bl.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
            bl.tiers_nom.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4">N° BL</th>
                                <th className="px-6 py-4">Destinataire</th>
                                <th className="px-6 py-4">Date de livraison</th>
                                <th className="px-6 py-4">Ref. Facture</th>
                                <th className="px-6 py-4">Statut</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                        <FileCheck2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>Aucun bon de livraison trouvé</p>
                                    </td>
                                </tr>
                            ) : filtered.map(bl => (
                                <tr key={bl.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4 font-medium text-slate-900">{bl.numero}</td>
                                    <td className="px-6 py-4 text-slate-600">{bl.tiers_nom}</td>
                                    <td className="px-6 py-4 text-slate-600">
                                        {new Date(bl.date_livraison).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500">{bl.facture_id || '-'}</td>
                                    <td className="px-6 py-4">
                                        <StatusBadge status={bl.statut} />
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                <Printer className="w-4 h-4" />
                                            </button>
                                            <button className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                                                <Edit className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header section with gradient background matching BERAMETHODE theme */}
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
                    <Receipt className="w-64 h-64 transform rotate-12" />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-bold mb-2 tracking-tight">Facturation & Documents</h1>
                        <p className="text-indigo-200 max-w-xl text-lg">
                            Gérez vos factures d'achat, de vente, devis et bons de livraison en un seul endroit.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 font-medium border border-white/10 backdrop-blur-sm">
                            <Settings className="w-5 h-5" />
                            <span>Paramètres</span>
                        </button>
                        <button className="bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-2.5 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/30 flex items-center gap-2 font-medium border border-emerald-400/50">
                            <Plus className="w-5 h-5" />
                            <span>Nouveau Document</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Tabs */}
            <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-64 shrink-0 space-y-2">
                    <button 
                        onClick={() => setActiveTab('VENTE')}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${activeTab === 'VENTE' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}
                    >
                        <div className="flex items-center gap-3 font-medium">
                            <ArrowRight className="w-5 h-5" />
                            <span>Factures Clients</span>
                        </div>
                        {activeTab === 'VENTE' && <ChevronRight className="w-5 h-5 opacity-50" />}
                    </button>
                    
                    <button 
                        onClick={() => setActiveTab('ACHAT')}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${activeTab === 'ACHAT' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}
                    >
                        <div className="flex items-center gap-3 font-medium">
                            <ArrowRight className="w-5 h-5 rotate-180" />
                            <span>Factures Achats</span>
                        </div>
                        {activeTab === 'ACHAT' && <ChevronRight className="w-5 h-5 opacity-50" />}
                    </button>

                    <button 
                        onClick={() => setActiveTab('DEVIS')}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${activeTab === 'DEVIS' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}
                    >
                        <div className="flex items-center gap-3 font-medium">
                            <Tag className="w-5 h-5" />
                            <span>Devis & Proformas</span>
                        </div>
                        {activeTab === 'DEVIS' && <ChevronRight className="w-5 h-5 opacity-50" />}
                    </button>

                    <button 
                        onClick={() => setActiveTab('BL')}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${activeTab === 'BL' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}
                    >
                        <div className="flex items-center gap-3 font-medium">
                            <FileCheck2 className="w-5 h-5" />
                            <span>Bons de Livraison</span>
                        </div>
                        {activeTab === 'BL' && <ChevronRight className="w-5 h-5 opacity-50" />}
                    </button>
                </div>

                <div className="flex-1 space-y-4">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input 
                                type="text"
                                placeholder={`Rechercher un document ou ${activeTab === 'ACHAT' ? 'fournisseur' : 'client'}...`}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-400"
                            />
                        </div>
                        <button className="p-2.5 text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all">
                            <Filter className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content Area */}
                    {isLoading ? (
                        <div className="h-64 flex items-center justify-center bg-white rounded-2xl border border-slate-100 shadow-sm">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : (
                        activeTab === 'BL' ? renderBLList() : renderFactureList()
                    )}
                </div>
            </div>
        </div>
    );
}

// Ensure icons used are defined if missing in the import
function Settings(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    )
}
