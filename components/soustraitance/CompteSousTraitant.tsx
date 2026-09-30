import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, Wallet, ReceiptText, CircleDollarSign, PackageSearch } from 'lucide-react';
import { tx } from '../../lib/i18n';
import { fmt } from '../../app/constants';
import { useLang } from '../../src/context/LanguageContext';
import type { Invoice } from '../../types';

interface CompteOrder {
  id: string;
  modelId: string;
  qtyAccepted?: number;
  pricePerPiece?: number;
}

interface CompteSousTraitantProps {
  subcontractorName: string;
  orders: CompteOrder[];
  currency: string;
}

/** Isole, dans les lignes d'une facture ACHAT sous-traitance, celle qui porte
 *  la FAÇON (main-d'œuvre) plutôt que la matière ou les frais — même
 *  heuristique que le reste du module (voir `openCostInvoiceModal` dans
 *  SousTraitance.tsx) : marqueur `kind === 'facon'` pour les factures créées
 *  après son introduction, repli sur la ligne unique modèle+quantité>1 pour
 *  les plus anciennes. Retourne `null` quand aucune des deux ne correspond —
 *  c'est le signal que le montant façon de cette facture n'est PAS déterminable. */
const faconLineTotal = (inv: Invoice, modelId: string): number | null => {
  const lignes: any[] = Array.isArray(inv.lignes) ? inv.lignes : [];
  const facon = lignes.find(l => l?.kind === 'facon')
    ?? (lignes[0]?.product_id === modelId && Number(lignes[0]?.quantite) > 1 ? lignes[0] : null);
  return facon ? (Number(facon.total) || 0) : null;
};

/**
 * Compte du sous-traitant : ce qu'on lui doit et ce qu'on lui a déjà réglé.
 *
 * facturé  = Σ total_ttc des factures ACHAT (source_module SOUSTRAITANCE) liées
 *            aux commandes de ce sous-traitant, hors statut ANNULEE.
 * payé     = Σ montant_paye de ces mêmes factures.
 * reste à payer = max(0, facturé − payé).
 * non facturé (livré) = pour chaque commande, qtyAccepted × pricePerPiece moins
 *            le montant façon déjà facturé pour CETTE commande, quand il est
 *            identifiable (marqueur de ligne). Si au moins une facture ne
 *            permet pas d'isoler la part façon (anciennes factures sans ce
 *            marqueur et sans ligne unique reconnaissable), tout l'agrégat
 *            retombe sur une ESTIMATION globale : Σ(qtyAccepté × prix) − facturé
 *            HT, plancher à 0 — étiquetée comme telle dans l'UI.
 */
export default function CompteSousTraitant({ subcontractorName, orders, currency }: CompteSousTraitantProps) {
  const { lang } = useLang();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderIds = useMemo(() => new Set(orders.map(o => o.id)), [orders]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/facturation/factures?source_module=SOUSTRAITANCE&type=ACHAT', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => { if (!cancelled) setInvoices(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setError(tx(lang, { fr: 'Erreur de chargement des factures.', ar: 'خطأ فتحميل الفواتير.', en: 'Error loading invoices.', es: 'Error al cargar las facturas.', pt: 'Erro ao carregar as faturas.', tr: 'Faturalar yüklenirken hata.' })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // Une seule requête par sélection de sous-traitant — pas de re-fetch au
    // moindre re-render du panneau.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcontractorName]);

  const computed = useMemo(() => {
    const relevant = invoices.filter(f => f.source_id && orderIds.has(f.source_id) && f.statut !== 'ANNULEE');

    let facture = 0;
    let factureHT = 0;
    let paye = 0;
    relevant.forEach(f => {
      facture += Number(f.total_ttc) || 0;
      factureHT += Number(f.total_ht) || 0;
      paye += Number(f.montant_paye) || 0;
    });

    let livreValue = 0;
    let nonFacturePrecis = 0;
    let anyEstimated = false;
    orders.forEach(o => {
      const value = (Number(o.qtyAccepted) || 0) * (Number(o.pricePerPiece) || 0);
      livreValue += value;
      const orderInvoices = relevant.filter(f => f.source_id === o.id);
      if (orderInvoices.length === 0) return; // rien de facturé pour cette commande : tout reste "non facturé", pas d'estimation à faire
      let faconHT = 0;
      let determinable = true;
      orderInvoices.forEach(f => {
        const line = faconLineTotal(f, o.modelId);
        if (line === null) { determinable = false; return; }
        faconHT += line;
      });
      if (!determinable) { anyEstimated = true; return; }
      nonFacturePrecis += Math.max(0, value - faconHT);
    });

    const nonFactureEstimate = Math.max(0, livreValue - factureHT);
    const nonFacture = anyEstimated ? nonFactureEstimate : nonFacturePrecis;

    return {
      facture,
      paye,
      resteAPayer: Math.max(0, facture - paye),
      nonFacture,
      isEstimate: anyEstimated,
    };
  }, [invoices, orderIds, orders]);

  const tiles = [
    { key: 'facture', label: tx(lang, { fr: 'Facturé', ar: 'المفوتَر', en: 'Invoiced', es: 'Facturado', pt: 'Faturado', tr: 'Faturalanan' }), value: computed.facture, icon: ReceiptText, color: 'text-indigo-600 dark:text-dk-accent-text' },
    { key: 'paye', label: tx(lang, { fr: 'Payé', ar: 'المؤدى', en: 'Paid', es: 'Pagado', pt: 'Pago', tr: 'Ödenen' }), value: computed.paye, icon: CircleDollarSign, color: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'reste', label: tx(lang, { fr: 'Reste à payer', ar: 'الباقي للأداء', en: 'Balance due', es: 'Saldo pendiente', pt: 'Saldo a pagar', tr: 'Kalan ödeme' }), value: computed.resteAPayer, icon: Wallet, color: computed.resteAPayer > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-dk-muted' },
    { key: 'nonFacture', label: tx(lang, { fr: 'Livré non facturé', ar: 'مُسلَّم غير مفوتَر', en: 'Delivered, not invoiced', es: 'Entregado sin facturar', pt: 'Entregue não faturado', tr: 'Teslim, faturalanmamış' }), value: computed.nonFacture, icon: PackageSearch, color: 'text-sky-600 dark:text-sky-400' },
  ];

  return (
    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-dk-border bg-slate-50/60 dark:bg-dk-bg/40">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide">
          {tx(lang, { fr: 'Compte', ar: 'الحساب', en: 'Account', es: 'Cuenta', pt: 'Conta', tr: 'Hesap' })}
        </h4>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-slate-400 dark:text-dk-muted" />}
      </div>

      {error ? (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          {tiles.map(t => (
            <div key={t.key} className="min-w-0 leading-tight">
              <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide flex items-center gap-1">
                <t.icon className="w-3 h-3 shrink-0" />
                {t.label}
                {t.key === 'nonFacture' && computed.isEstimate && (
                  <span
                    className="text-[8px] font-bold text-slate-400 dark:text-dk-muted normal-case"
                    title={tx(lang, { fr: 'Estimation : la part façon de certaines factures ne peut pas être isolée du reste.', ar: 'تقدير: لا يمكن عزل حصة الخياطة فبعض الفواتير عن الباقي.', en: 'Estimate: the labor share of some invoices cannot be isolated.', es: 'Estimación: la parte de confección de algunas facturas no se puede aislar.', pt: 'Estimativa: a parte de confeção de algumas faturas não pode ser isolada.', tr: 'Tahmin: bazı faturaların işçilik payı ayrıştırılamıyor.' })}
                  >
                    ({tx(lang, { fr: 'estimation', ar: 'تقدير', en: 'estimate', es: 'estimación', pt: 'estimativa', tr: 'tahmin' })})
                  </span>
                )}
              </p>
              <p className={`text-[13px] font-bold ${t.color}`}>{fmt(t.value)} {currency}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
