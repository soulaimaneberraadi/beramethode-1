import React, { useState, useEffect } from 'react';
import { FileText, Plus, Printer, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Invoice, InvoiceLine } from '../types';
import InvoiceModalInvoice from './InvoiceModalInvoice';

interface InlineInvoiceListProps {
    productId: string;
    productLabel: string;
    sourceModule?: string;
    sourceId?: string;
}

const STATUS_COLORS: Record<string, string> = {
    BROUILLON: 'bg-slate-400 dark:bg-slate-500',
    VALIDEE: 'bg-[#2149C1] dark:bg-blue-500',
    PAYEE: 'bg-emerald-700 dark:bg-emerald-500',
    ANNULEE: 'bg-red-500 dark:bg-red-400',
};

export default function InlineInvoiceList({ productId, productLabel, sourceModule = 'magasin', sourceId = productId }: InlineInvoiceListProps) {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [lineDetails, setLineDetails] = useState<Record<string, InvoiceLine[]>>({});
    const [loadingLines, setLoadingLines] = useState<Record<string, boolean>>({});
    const [modalOpen, setModalOpen] = useState(false);

    useEffect(() => {
        loadInvoices();
    }, [productId]);

    const loadInvoices = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/invoices/product/${productId}`);
            if (!res.ok) throw new Error('Erreur chargement factures');
            const data = await res.json();
            setInvoices(data);
        } catch (e: any) {
            setError(e.message || 'Erreur de chargement');
        } finally {
            setIsLoading(false);
        }
    };

    const loadLines = async (invoiceId: string) => {
        if (lineDetails[invoiceId]) return;
        setLoadingLines(prev => ({ ...prev, [invoiceId]: true }));
        try {
            const res = await fetch(`/api/invoices/${invoiceId}`);
            if (!res.ok) throw new Error('Erreur chargement détails');
            const data = await res.json();
            setLineDetails(prev => ({ ...prev, [invoiceId]: data.lines || [] }));
        } catch {
        } finally {
            setLoadingLines(prev => ({ ...prev, [invoiceId]: false }));
        }
    };

    const toggleExpand = (invoiceId: string) => {
        if (expandedId === invoiceId) {
            setExpandedId(null);
            return;
        }
        setExpandedId(invoiceId);
        loadLines(invoiceId);
    };

    const handlePrint = (inv: Invoice) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        printWindow.document.write(`
            <html><head><title>Facture ${inv.numero}</title>
            <style>body{font-family:sans-serif;padding:40px}table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd;text-align:left}</style>
            </head><body>
            <h2>Facture ${inv.numero}</h2>
            <p>Type: ${inv.type} | Date: ${inv.date_invoice} | Statut: ${inv.statut}</p>
            <p>Client: ${inv.tiers_nom || '-'}</p>
            <table><thead><tr><th>Désignation</th><th>Qté</th><th>Prix unit.</th><th>Total</th></tr></thead><tbody>
            ${(lineDetails[inv.id] || inv.lines || []).map((l: any) =>
                `<tr><td>${l.designation || ''}</td><td>${l.quantite ?? 0}</td><td>${(l.prix_unitaire ?? 0).toFixed(2)}</td><td>${(l.total ?? 0).toFixed(2)}</td></tr>`
            ).join('')}
            </tbody></table>
            <p style="text-align:right;font-weight:bold;margin-top:20px">Total TTC: ${(inv.total_ttc ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MAD</p>
            </body></html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    const formatCurrency = (val: number) =>
        val.toLocaleString('fr-FR', { minimumFractionDigits: 2 });

    const handleSaved = () => {
        setModalOpen(false);
        loadInvoices();
    };

    const renderLoading = () => (
        <div className="h-24 flex items-center justify-center border border-slate-200 dark:border-dk-border rounded-lg">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-900 dark:border-dk-text" />
        </div>
    );

    const renderEmpty = () => (
        <div className="border border-slate-200 dark:border-dk-border rounded-lg">
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-dk-muted">
                <FileText className="w-6 h-6 mb-2 opacity-20" strokeWidth={1.75} />
                <p className="text-[12px]">Aucune facture pour ce produit</p>
            </div>
        </div>
    );

    const renderError = () => (
        <div className="p-3 border border-red-200 dark:border-red-800 rounded-lg bg-red-50/60 dark:bg-red-900/20">
            <div className="flex items-center justify-between">
                <p className="text-[12px] text-red-700 dark:text-red-400">{error}</p>
                <button onClick={loadInvoices} className="flex items-center gap-1 text-[11px] font-medium text-slate-900 dark:text-dk-text underline">
                    <RefreshCw className="w-3" strokeWidth={1.75} />
                    Réessayer
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text">Factures liées</h3>
                <button
                    onClick={() => setModalOpen(true)}
                    className="h-8 px-3 bg-slate-900 dark:bg-dk-accent hover:bg-slate-800 dark:hover:bg-dk-accent/90 text-white text-[12px] font-medium rounded-md transition-colors flex items-center gap-1.5"
                >
                    <Plus className="w-3.5" strokeWidth={1.75} />
                    Ajouter Facture
                </button>
            </div>

            {isLoading ? renderLoading() : error ? renderError() : invoices.length === 0 ? renderEmpty() : (
                <div className="border border-slate-200 dark:border-dk-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50/60 dark:bg-dk-bg/60 border-b border-slate-100 dark:border-dk-border">
                            <tr>
                                <th className="px-4 py-2.5 text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide w-8"></th>
                                <th className="px-4 py-2.5 text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide">N°</th>
                                <th className="px-4 py-2.5 text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide">Type</th>
                                <th className="px-4 py-2.5 text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide">Date</th>
                                <th className="px-4 py-2.5 text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide text-right">Montant TTC</th>
                                <th className="px-4 py-2.5 text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide">Statut</th>
                                <th className="px-4 py-2.5 text-[11px] font-medium text-slate-500 dark:text-dk-muted uppercase tracking-wide text-right w-12">Imp.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                            {invoices.map(inv => (
                                <React.Fragment key={inv.id}>
                                    <tr
                                        className="hover:bg-slate-50/50 dark:hover:bg-dk-elevated/40 transition-colors group cursor-pointer"
                                        onClick={() => toggleExpand(inv.id)}
                                    >
                                        <td className="px-4 py-2.5">
                                            {expandedId === inv.id ? (
                                                <ChevronDown className="w-3.5 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                                            ) : (
                                                <ChevronRight className="w-3.5 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-[13px] font-medium text-slate-900 dark:text-dk-text tabular-nums">{inv.numero}</td>
                                        <td className="px-4 py-2.5 text-[13px] text-slate-700 dark:text-dk-text-soft">{inv.type}</td>
                                        <td className="px-4 py-2.5 text-[13px] text-slate-500 dark:text-dk-muted tabular-nums">
                                            {inv.date_invoice ? new Date(inv.date_invoice).toLocaleDateString('fr-FR') : '-'}
                                        </td>
                                        <td className="px-4 py-2.5 text-[13px] font-semibold text-slate-900 dark:text-dk-text tabular-nums text-right">
                                            {formatCurrency(inv.total_ttc || 0)}
                                            <span className="text-[10px] font-normal text-slate-400 dark:text-dk-muted ml-1">MAD</span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-dk-muted">
                                                <span className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[inv.statut] || 'bg-slate-400 dark:bg-slate-500'} flex-shrink-0`} />
                                                {inv.statut}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handlePrint(inv); }}
                                                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 dark:text-dk-muted hover:text-slate-900 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors opacity-0 group-hover:opacity-100"
                                                title="Imprimer"
                                            >
                                                <Printer className="w-3.5" strokeWidth={1.75} />
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedId === inv.id && (
                                        <tr key={`${inv.id}-details`}>
                                            <td colSpan={7} className="px-4 py-3 bg-slate-50/30 dark:bg-dk-bg/30">
                                                {loadingLines[inv.id] ? (
                                                    <div className="flex items-center justify-center py-4">
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-400 dark:border-dk-muted" />
                                                    </div>
                                                ) : (
                                                    <div className="border border-slate-200 dark:border-dk-border rounded-lg overflow-hidden">
                                                        <table className="w-full text-sm text-left">
                                                            <thead className="bg-slate-50/60 dark:bg-dk-bg/60 border-b border-slate-100 dark:border-dk-border">
                                                                <tr>
                                                                    <th className="px-3 py-1.5 text-[11px] font-medium text-slate-400 dark:text-dk-muted uppercase tracking-wide">Désignation</th>
                                                                    <th className="px-3 py-1.5 text-[11px] font-medium text-slate-400 dark:text-dk-muted uppercase tracking-wide text-right">Qté</th>
                                                                    <th className="px-3 py-1.5 text-[11px] font-medium text-slate-400 dark:text-dk-muted uppercase tracking-wide text-right">Prix unit.</th>
                                                                    <th className="px-3 py-1.5 text-[11px] font-medium text-slate-400 dark:text-dk-muted uppercase tracking-wide text-right">Total</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                                                {(lineDetails[inv.id] || []).length === 0 ? (
                                                                    <tr>
                                                                        <td colSpan={4} className="px-3 py-4 text-center text-[12px] text-slate-400 dark:text-dk-muted">Aucune ligne détaillée</td>
                                                                    </tr>
                                                                ) : (lineDetails[inv.id] || []).map((line, idx) => (
                                                                    <tr key={line.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-dk-elevated/40">
                                                                        <td className="px-3 py-1.5 text-[12px] text-slate-700 dark:text-dk-text-soft">{line.designation || '-'}</td>
                                                                        <td className="px-3 py-1.5 text-[12px] text-slate-900 dark:text-dk-text tabular-nums text-right">{line.quantite}</td>
                                                                        <td className="px-3 py-1.5 text-[12px] text-slate-900 dark:text-dk-text tabular-nums text-right">
                                                                            {formatCurrency(line.prix_unitaire)}
                                                                        </td>
                                                                        <td className="px-3 py-1.5 text-[12px] font-semibold text-slate-900 dark:text-dk-text tabular-nums text-right">
                                                                            {formatCurrency(line.total)}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modalOpen && (
                <InvoiceModalInvoice
                    context={{
                        sourceModule,
                        sourceId,
                        productId,
                        productLabel,
                    }}
                    onClose={() => setModalOpen(false)}
                    onSaved={handleSaved}
                />
            )}
        </div>
    );
}
