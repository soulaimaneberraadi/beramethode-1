import React, { useState, useEffect, useMemo } from 'react';
import {
    Receipt, Search, FileText, ArrowRight, Tag, FileCheck2, DollarSign,
    TrendingUp, Clock, AlertCircle, Eye, Filter, RefreshCw, ChevronRight,
    ExternalLink, CreditCard
} from 'lucide-react';
import { Facture } from '../types';

interface FacturationProps {
    t: (key: string) => string;
}

const STATUS_COLORS: Record<string, string> = {
    BROUILLON: 'bg-slate-400',
    ENVOYEE: 'bg-[#2149C1]',
    PAYEE: 'bg-emerald-700',
    PARTIELLEMENT: 'bg-amber-500',
    ANNULEE: 'bg-red-500',
    ACCEPTE: 'bg-emerald-700',
    REFUSE: 'bg-red-500',
};

const formatCurrency = (val: number) =>
    val.toLocaleString('fr-FR', { minimumFractionDigits: 2 });

const StatusDot = ({ status }: { status: string }) => (
    <span className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[status] || 'bg-slate-400'} flex-shrink-0`} />
);

function getDateRangeLabel(key: 'today' | 'week' | 'month'): { start: Date; end: Date } {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let start: Date;
    if (key === 'today') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (key === 'week') {
        const day = now.getDay();
        const diff = day === 0 ? 6 : day - 1;
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    } else {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { start, end };
}

export default function Facturation({ t }: FacturationProps) {
    const [allFactures, setAllFactures] = useState<Facture[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
    const [view, setView] = useState<'dashboard' | 'pending'>('dashboard');

    useEffect(() => {
        loadAll();
    }, []);

    const loadAll = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/facturation/factures');
            if (!res.ok) throw new Error('Erreur chargement factures');
            const data = await res.json();
            setAllFactures(data);
        } catch (e: any) {
            setError(e.message || 'Erreur de chargement');
        } finally {
            setIsLoading(false);
        }
    };

    const facturesFiltrees = useMemo(() => {
        let filtered = allFactures;

        if (searchTerm) {
            const s = searchTerm.toLowerCase();
            filtered = filtered.filter(f =>
                f.numero?.toLowerCase().includes(s) ||
                f.tiers_nom?.toLowerCase().includes(s)
            );
        }

        if (dateFilter !== 'all') {
            const { start, end } = getDateRangeLabel(dateFilter);
            filtered = filtered.filter(f => {
                const d = new Date(f.date_facture);
                return d >= start && d <= end;
            });
        }

        return filtered;
    }, [allFactures, searchTerm, dateFilter]);

    const stats = useMemo(() => {
        const totalTTC = allFactures.reduce((s, f) => s + (f.total_ttc || 0), 0);
        const totalPaye = allFactures.reduce((s, f) => s + (f.montant_paye || 0), 0);
        const totalRestant = totalTTC - totalPaye;

        const countByType: Record<string, number> = {};
        for (const f of allFactures) {
            countByType[f.type] = (countByType[f.type] || 0) + 1;
        }

        const facturesNonPayees = allFactures.filter(f =>
            f.statut !== 'PAYEE' && f.statut !== 'ANNULEE'
        );

        return { totalTTC, totalPaye, totalRestant, countByType, facturesNonPayees };
    }, [allFactures]);

    const recentFactures = useMemo(() =>
        [...allFactures].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ).slice(0, 5),
    [allFactures]);

    if (error) {
        return (
            <div className="space-y-5">
                <div className="flex items-center justify-between h-14 border-b border-slate-100 dark:border-dk-border">
                    <div className="flex items-center gap-2.5">
                        <Receipt className="w-4 text-slate-400" strokeWidth={1.75} />
                        <h1 className="text-[15px] font-semibold text-slate-900 dark:text-dk-text">Dashboard Facturation</h1>
                    </div>
                </div>
                <div className="p-5 border border-red-200 dark:border-red-900/30 rounded-lg bg-red-50/60 dark:bg-red-900/20">
                    <p className="text-[13px] text-red-700">{error}</p>
                    <button onClick={loadAll} className="mt-2 text-[12px] font-medium text-slate-900 dark:text-dk-text underline flex items-center gap-1">
                        <RefreshCw className="w-3" strokeWidth={1.75} />
                        Réessayer
                    </button>
                </div>
            </div>
        );
    }

    const renderStatsRow = () => (
        <div className="grid grid-cols-3 gap-3">
            <div className="border border-slate-200 dark:border-dk-border rounded-lg p-4 bg-slate-50/60 dark:bg-dk-surface">
                <span className="text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide">Total TTC</span>
                <p className="text-[15px] font-semibold text-slate-900 dark:text-dk-text tabular-nums mt-1">
                    {formatCurrency(stats.totalTTC)} <span className="text-[10px] font-normal text-slate-400">MAD</span>
                </p>
            </div>
            <div className="border border-slate-200 dark:border-dk-border rounded-lg p-4 bg-slate-50/60 dark:bg-dk-surface">
                <span className="text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide">Payé</span>
                <p className="text-[15px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
                    {formatCurrency(stats.totalPaye)} <span className="text-[10px] font-normal text-slate-400">MAD</span>
                </p>
            </div>
            <div className="border border-slate-200 dark:border-dk-border rounded-lg p-4 bg-slate-50/60 dark:bg-dk-surface">
                <span className="text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide">Restant</span>
                <p className="text-[15px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums mt-1">
                    {formatCurrency(stats.totalRestant)} <span className="text-[10px] font-normal text-slate-400">MAD</span>
                </p>
            </div>
        </div>
    );

    const renderTypeCounts = () => (
        <div className="flex flex-wrap gap-2">
            {Object.entries(stats.countByType).map(([type, count]) => (
                <div key={type} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-dk-border rounded-md bg-white dark:bg-dk-surface">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-dk-muted">{type}</span>
                    <span className="text-[13px] font-semibold text-slate-900 dark:text-dk-text tabular-nums">{count}</span>
                </div>
            ))}
        </div>
    );

    const renderSearch = () => (
        <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 text-slate-400" strokeWidth={1.75} />
            <input
                type="text"
                placeholder="Rechercher par numéro ou tiers..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-9 pl-8 pr-3 bg-slate-50/60 dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md text-[12px] text-slate-700 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:bg-white dark:focus:bg-dk-surface focus:border-slate-300 dark:focus:border-dk-border focus:ring-2 focus:ring-slate-100 dark:focus:ring-dk-border outline-none transition-all"
            />
        </div>
    );

    const renderDateFilter = () => (
        <div className="bg-slate-100/60 dark:bg-dk-elevated rounded-md p-0.5 inline-flex">
            {(['all', 'today', 'week', 'month'] as const).map(key => (
                <button
                    key={key}
                    onClick={() => setDateFilter(key)}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                        dateFilter === key
                            ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text dark:text-dk-text shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                            : 'text-slate-500 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text'
                    }`}
                >
                    {key === 'all' ? 'Tout' : key === 'today' ? 'Aujourd\'hui' : key === 'week' ? 'Cette semaine' : 'Ce mois'}
                </button>
            ))}
        </div>
    );

    const renderRecentActivity = () => (
        <div className="border border-slate-200 dark:border-dk-border rounded-lg">
            <div className="px-5 h-12 border-b border-slate-100 dark:border-dk-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 text-slate-400" strokeWidth={1.75} />
                    <h2 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text">Activité récente</h2>
                </div>
                <span className="text-[11px] text-slate-400 tabular-nums">{allFactures.length} factures</span>
            </div>
            <div className="divide-y divide-slate-100">
                {recentFactures.length === 0 ? (
                    <div className="px-5 py-10 text-center text-slate-400">
                        <FileText className="w-6 h-6 mx-auto mb-2 opacity-20" strokeWidth={1.75} />
                        <p className="text-[12px]">Aucune facture récente</p>
                    </div>
                ) : recentFactures.map(f => (
                    <div key={f.id} className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-dk-elevated transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-slate-500 border border-slate-200 dark:border-dk-border uppercase">
                                {f.type}
                            </span>
                            <span className="text-[13px] font-medium text-slate-900 dark:text-dk-text tabular-nums truncate">{f.numero}</span>
                            <span className="text-[12px] text-slate-500 truncate">{f.tiers_nom}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-[13px] font-semibold text-slate-900 dark:text-dk-text tabular-nums">
                                {formatCurrency(f.total_ttc || 0)} <span className="text-[10px] font-normal text-slate-400">MAD</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
                                <StatusDot status={f.statut} />
                                {f.statut}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderPendingPayments = () => {
        const pending = stats.facturesNonPayees;
        return (
            <div className="border border-slate-200 dark:border-dk-border rounded-lg">
                <div className="px-5 h-12 border-b border-slate-100 dark:border-dk-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 text-slate-400" strokeWidth={1.75} />
                        <h2 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text">Paiements en attente</h2>
                        {pending.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">{pending.length}</span>
                        )}
                    </div>
                </div>
                <div className="divide-y divide-slate-100">
                    {pending.length === 0 ? (
                        <div className="px-5 py-10 text-center text-slate-400">
                            <CreditCard className="w-6 h-6 mx-auto mb-2 opacity-20" strokeWidth={1.75} />
                            <p className="text-[12px]">Toutes les factures sont payées</p>
                        </div>
                    ) : pending.map(f => (
                        <div key={f.id} className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-dk-elevated transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-slate-500 border border-slate-200 dark:border-dk-border uppercase">
                                    {f.type}
                                </span>
                                <span className="text-[13px] font-medium text-slate-900 dark:text-dk-text tabular-nums">{f.numero}</span>
                                <span className="text-[12px] text-slate-500 truncate">{f.tiers_nom}</span>
                            </div>
                            <div className="flex items-center gap-4 flex-shrink-0">
                                <div className="text-right">
                                    <p className="text-[13px] font-semibold text-slate-900 dark:text-dk-text tabular-nums">{formatCurrency(f.total_ttc || 0)} MAD</p>
                                    <p className="text-[11px] text-slate-400 tabular-nums">Payé: {formatCurrency(f.montant_paye || 0)} MAD</p>
                                </div>
                                <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
                                    <StatusDot status={f.statut} />
                                    {f.statut}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderSearchResults = () => {
        if (!searchTerm) return null;
        return (
            <div className="border border-slate-200 dark:border-dk-border rounded-lg">
                <div className="px-5 h-12 border-b border-slate-100 dark:border-dk-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Search className="w-4 text-slate-400" strokeWidth={1.75} />
                        <h2 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text">Résultats de recherche</h2>
                    </div>
                    <span className="text-[11px] text-slate-400 tabular-nums">{facturesFiltrees.length} trouvé(s)</span>
                </div>
                <div className="divide-y divide-slate-100">
                    {facturesFiltrees.length === 0 ? (
                        <div className="px-5 py-10 text-center text-slate-400">
                            <FileText className="w-6 h-6 mx-auto mb-2 opacity-20" strokeWidth={1.75} />
                            <p className="text-[12px]">Aucun résultat pour "{searchTerm}"</p>
                        </div>
                    ) : facturesFiltrees.map(f => (
                        <div key={f.id} className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-dk-elevated transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-slate-500 border border-slate-200 dark:border-dk-border uppercase">
                                    {f.type}
                                </span>
                                <span className="text-[13px] font-medium text-slate-900 dark:text-dk-text tabular-nums">{f.numero}</span>
                                <span className="text-[12px] text-slate-500 truncate">{f.tiers_nom}</span>
                                <span className="text-[11px] text-slate-400 tabular-nums">
                                    {new Date(f.date_facture).toLocaleDateString('fr-FR')}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="text-[13px] font-semibold text-slate-900 dark:text-dk-text tabular-nums">
                                    {formatCurrency(f.total_ttc || 0)} MAD
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
                                    <StatusDot status={f.statut} />
                                    {f.statut}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderInlineInvoiceLink = () => (
        <div className="border border-slate-200 dark:border-dk-border rounded-lg p-4 bg-slate-50/60 dark:bg-dk-surface">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <FileText className="w-4 text-slate-400" strokeWidth={1.75} />
                    <div>
                        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text">عرض فواتير مادة</h3>
                        <p className="text-[11px] text-slate-500 dark:text-dk-muted">تصفح الفواتير المرتبطة بمنتج معين</p>
                    </div>
                </div>
                <ChevronRight className="w-4 text-slate-400" strokeWidth={1.75} />
            </div>
        </div>
    );

    const renderPendingTab = () => (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 text-slate-400" strokeWidth={1.75} />
                    <h2 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text">Factures non payées</h2>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">{stats.facturesNonPayees.length}</span>
                </div>
                <span className="text-[12px] text-slate-500 tabular-nums">
                    Total: {formatCurrency(stats.facturesNonPayees.reduce((s, f) => s + (f.total_ttc || 0), 0))} MAD
                </span>
            </div>
            {renderPendingPayments()}
        </div>
    );

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between h-14 border-b border-slate-100 dark:border-dk-border">
                <div className="flex items-center gap-2.5">
                    <Receipt className="w-4 text-slate-400" strokeWidth={1.75} />
                    <h1 className="text-[15px] font-semibold text-slate-900 dark:text-dk-text">Dashboard Facturation</h1>
                    {isLoading && (
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-slate-400 ml-2" />
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="bg-slate-100/60 dark:bg-dk-elevated rounded-md p-0.5 inline-flex">
                        <button
                            onClick={() => setView('dashboard')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                                view === 'dashboard'
                                    ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text dark:text-dk-text shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                                    : 'text-slate-500 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text'
                            }`}
                        >
                            <TrendingUp className="w-3.5" strokeWidth={1.75} />
                            Dashboard
                        </button>
                        <button
                            onClick={() => setView('pending')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                                view === 'pending'
                                    ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text dark:text-dk-text shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                                    : 'text-slate-500 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text'
                            }`}
                        >
                            <DollarSign className="w-3.5" strokeWidth={1.75} />
                            Impayés
                            {stats.facturesNonPayees.length > 0 && (
                                <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                                    {stats.facturesNonPayees.length}
                                </span>
                            )}
                        </button>
                    </div>
                    <button
                        onClick={loadAll}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 dark:text-dk-muted hover:text-slate-900 dark:text-dk-text dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors"
                        title="Actualiser"
                    >
                        <RefreshCw className="w-3.5" strokeWidth={1.75} />
                    </button>
                </div>
            </div>

            {view === 'pending' ? (
                renderPendingTab()
            ) : (
                <>
                    {renderStatsRow()}

                    {renderTypeCounts()}

                    <div className="flex items-center gap-3">
                        {renderSearch()}
                        {renderDateFilter()}
                    </div>

                    {searchTerm ? renderSearchResults() : (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2 space-y-3">
                                {renderRecentActivity()}
                            </div>
                            <div className="space-y-3">
                                {renderPendingPayments()}
                                {renderInlineInvoiceLink()}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
