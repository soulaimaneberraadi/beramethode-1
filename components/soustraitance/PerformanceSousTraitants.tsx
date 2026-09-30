import React, { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Star, Users } from 'lucide-react';
import { tx } from '../../lib/i18n';
import { fmt } from '../../app/constants';
import { useLang } from '../../src/context/LanguageContext';
import SheetModal from '../shared/SheetModal';
import type { SubcontractOrder } from '../../types';

interface PerformanceSousTraitantsProps {
  onClose: () => void;
  subcontractorGroups: Array<{ name: string; orders: SubcontractOrder[] }>;
  /** Toutes les entrées de stock (`st_stock_entries`), déjà chargées par
   *  SousTraitance.tsx dans `allStockEntries` — sert à dater la livraison
   *  réelle de chaque commande (dernière entrée qui la concerne). */
  stockEntries: any[];
  currency: string;
}

type SortKey = 'name' | 'nbCommandes' | 'pieces' | 'prixMoyen' | 'qualite' | 'retouche' | 'rejet' | 'ponctualite' | 'retardMoyen' | 'note';

interface Row {
  name: string;
  nbCommandes: number;
  pieces: number;
  prixMoyen: number;
  qualite: number | null;
  retouche: number | null;
  rejet: number | null;
  ponctualite: number | null;
  retardMoyen: number | null;
  note: number | null;
}

const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);

/**
 * Comparatif des sous-traitants — pure calcul côté client à partir des props
 * déjà chargées par SousTraitance.tsx (aucun fetch ici).
 *
 * « Date de livraison réelle » d'une commande = date de la DERNIÈRE entrée de
 * stock (`st_stock_entries.date_entree`, ou `created_at` à défaut) qui lui est
 * rattachée. Une commande sans aucune entrée de stock n'est pas considérée
 * comme livrée et n'entre ni dans la ponctualité ni dans le retard moyen —
 * seul son statut « En retard » (affiché sur la carte commande) capture son cas.
 * Ponctualité = commandes livrées à temps (date réelle ≤ deliveryDate) / total
 * des commandes livrées. Retard moyen = moyenne de max(0, réelle − prévue) en
 * jours sur les commandes livrées (0 si à l'heure ou en avance).
 */
export default function PerformanceSousTraitants({ onClose, subcontractorGroups, stockEntries, currency }: PerformanceSousTraitantsProps) {
  const { lang } = useLang();
  const [sortKey, setSortKey] = useState<SortKey>('pieces');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const lastEntryDateByOrder = useMemo(() => {
    const map = new Map<string, Date>();
    stockEntries.forEach(e => {
      const orderId = e.order_id;
      if (!orderId) return;
      const raw = e.date_entree || e.created_at;
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return;
      const prev = map.get(orderId);
      if (!prev || d.getTime() > prev.getTime()) map.set(orderId, d);
    });
    return map;
  }, [stockEntries]);

  const rows: Row[] = useMemo(() => {
    return subcontractorGroups.map(g => {
      const orders = g.orders;
      const nbCommandes = orders.length;
      const pieces = orders.reduce((s, o) => s + (o.totalQuantity || 0), 0);
      const montant = orders.reduce((s, o) => s + (o.totalQuantity || 0) * (o.pricePerPiece || 0), 0);
      const prixMoyen = pieces > 0 ? montant / pieces : 0;

      let accepted = 0, repair = 0, rejected = 0;
      orders.forEach(o => {
        accepted += o.qtyAccepted || 0;
        repair += o.qtyToRepair || 0;
        rejected += o.qtyRejected || 0;
      });
      const controlled = accepted + repair + rejected;
      const qualite = controlled > 0 ? (accepted / controlled) * 100 : null;
      const retouche = controlled > 0 ? (repair / controlled) * 100 : null;
      const rejet = controlled > 0 ? (rejected / controlled) * 100 : null;

      let onTimeCount = 0;
      let deliveredCount = 0;
      let retardSum = 0;
      orders.forEach(o => {
        const lastEntry = lastEntryDateByOrder.get(o.id);
        if (!lastEntry || !o.deliveryDate) return;
        const planned = new Date(o.deliveryDate);
        if (isNaN(planned.getTime())) return;
        deliveredCount++;
        const delay = diffDays(lastEntry, planned);
        if (delay <= 0) onTimeCount++;
        retardSum += Math.max(0, delay);
      });
      const ponctualite = deliveredCount > 0 ? (onTimeCount / deliveredCount) * 100 : null;
      const retardMoyen = deliveredCount > 0 ? retardSum / deliveredCount : null;

      const rated = orders.filter(o => (o.subcontractorRating || 0) > 0);
      const note = rated.length > 0 ? rated.reduce((s, o) => s + (o.subcontractorRating || 0), 0) / rated.length : null;

      return { name: g.name, nbCommandes, pieces, prixMoyen, qualite, retouche, rejet, ponctualite, retardMoyen, note };
    });
  }, [subcontractorGroups, lastEntryDateByOrder]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // les valeurs indisponibles vont en fin de liste, quel que soit le sens
      if (vb === null) return -1;
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: 'name', label: tx(lang, { fr: 'Sous-traitant', ar: 'المقاول من الباطن', en: 'Subcontractor', es: 'Subcontratista', pt: 'Subcontratado', tr: 'Taşeron' }) },
    { key: 'nbCommandes', label: tx(lang, { fr: 'Commandes', ar: 'الطلبيات', en: 'Orders', es: 'Pedidos', pt: 'Encomendas', tr: 'Siparişler' }) },
    { key: 'pieces', label: tx(lang, { fr: 'Pièces', ar: 'القطع', en: 'Pieces', es: 'Piezas', pt: 'Peças', tr: 'Parçalar' }) },
    { key: 'prixMoyen', label: tx(lang, { fr: 'Prix moy./pièce', ar: 'متوسط السعر/قطعة', en: 'Avg price/piece', es: 'Precio medio/pieza', pt: 'Preço médio/peça', tr: 'Ort. fiyat/adet' }) },
    { key: 'qualite', label: tx(lang, { fr: 'Qualité', ar: 'الجودة', en: 'Quality', es: 'Calidad', pt: 'Qualidade', tr: 'Kalite' }) },
    { key: 'retouche', label: tx(lang, { fr: 'Retouche', ar: 'التعديل', en: 'Rework', es: 'Retoque', pt: 'Retoque', tr: 'Rötuş' }) },
    { key: 'rejet', label: tx(lang, { fr: 'Rejet', ar: 'الرفض', en: 'Reject', es: 'Rechazo', pt: 'Rejeição', tr: 'Red' }) },
    { key: 'ponctualite', label: tx(lang, { fr: 'Ponctualité', ar: 'الالتزام بالمواعيد', en: 'On-time', es: 'Puntualidad', pt: 'Pontualidade', tr: 'Zamanında teslim' }) },
    { key: 'retardMoyen', label: tx(lang, { fr: 'Retard moy.', ar: 'متوسط التأخير', en: 'Avg delay', es: 'Retraso medio', pt: 'Atraso médio', tr: 'Ort. gecikme' }) },
    { key: 'note', label: tx(lang, { fr: 'Note', ar: 'التقييم', en: 'Rating', es: 'Nota', pt: 'Nota', tr: 'Puan' }) },
  ];

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const fmtPct = (v: number | null) => (v === null ? '—' : `${fmt(v)}%`);
  const fmtDays = (v: number | null) => (v === null ? '—' : `${fmt(v)} j`);
  const fmtNote = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}/5`);

  return (
    <SheetModal
      onClose={onClose}
      title={tx(lang, { fr: 'Comparer les sous-traitants', ar: 'مقارنة المقاولين من الباطن', en: 'Compare subcontractors', es: 'Comparar subcontratistas', pt: 'Comparar subcontratados', tr: 'Taşeronları karşılaştır' })}
      icon={<Users className="w-4 h-4" />}
      size="2xl"
    >
      {sortedRows.length === 0 ? (
        <div className="text-center text-slate-400 dark:text-dk-muted text-xs py-10">
          {tx(lang, { fr: 'Aucun sous-traitant à comparer.', ar: 'لا يوجد مقاول من الباطن للمقارنة.', en: 'No subcontractor to compare.', es: 'Ningún subcontratista para comparar.', pt: 'Nenhum subcontratado para comparar.', tr: 'Karşılaştırılacak taşeron yok.' })}
        </div>
      ) : (
        <>
          {/* Tableau — masqué sur mobile, remplacé par des cartes */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-dk-bg border-b border-slate-100 dark:border-dk-border text-slate-500 dark:text-dk-muted font-semibold uppercase">
                <tr>
                  {columns.map(c => (
                    <th key={c.key} className="px-3 py-2.5 whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-indigo-600 dark:hover:text-dk-accent-text">
                        {c.label}
                        <SortIcon col={c.key} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                {sortedRows.map(r => (
                  <tr key={r.name} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/50">
                    <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-dk-text whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-dk-text-soft">{r.nbCommandes}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-dk-text-soft">{r.pieces.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-dk-text-soft whitespace-nowrap">{fmt(r.prixMoyen)} {currency}</td>
                    <td className="px-3 py-2.5 font-semibold text-emerald-600 dark:text-emerald-400">{fmtPct(r.qualite)}</td>
                    <td className="px-3 py-2.5 text-amber-600 dark:text-amber-400">{fmtPct(r.retouche)}</td>
                    <td className="px-3 py-2.5 text-rose-600 dark:text-rose-400">{fmtPct(r.rejet)}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700 dark:text-dk-text-soft">{fmtPct(r.ponctualite)}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-dk-text-soft">{fmtDays(r.retardMoyen)}</td>
                    <td className="px-3 py-2.5 text-amber-500">{fmtNote(r.note)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cartes — mobile uniquement */}
          <div className="sm:hidden space-y-2.5">
            {sortedRows.map(r => (
              <div key={r.name} className="border border-slate-200 dark:border-dk-border rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-dk-text text-sm">{r.name}</span>
                  <span className="flex items-center gap-1 text-amber-500 text-xs font-semibold"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{fmtNote(r.note)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-dk-text-soft">
                  <span>{tx(lang, { fr: 'Commandes', ar: 'الطلبيات', en: 'Orders', es: 'Pedidos', pt: 'Encomendas', tr: 'Siparişler' })}: <b>{r.nbCommandes}</b></span>
                  <span>{tx(lang, { fr: 'Pièces', ar: 'القطع', en: 'Pieces', es: 'Piezas', pt: 'Peças', tr: 'Parçalar' })}: <b>{r.pieces.toLocaleString()}</b></span>
                  <span>{tx(lang, { fr: 'Prix moy.', ar: 'متوسط السعر', en: 'Avg price', es: 'Precio medio', pt: 'Preço médio', tr: 'Ort. fiyat' })}: <b>{fmt(r.prixMoyen)} {currency}</b></span>
                  <span>{tx(lang, { fr: 'Qualité', ar: 'الجودة', en: 'Quality', es: 'Calidad', pt: 'Qualidade', tr: 'Kalite' })}: <b className="text-emerald-600 dark:text-emerald-400">{fmtPct(r.qualite)}</b></span>
                  <span>{tx(lang, { fr: 'Retouche', ar: 'التعديل', en: 'Rework', es: 'Retoque', pt: 'Retoque', tr: 'Rötuş' })}: <b className="text-amber-600 dark:text-amber-400">{fmtPct(r.retouche)}</b></span>
                  <span>{tx(lang, { fr: 'Rejet', ar: 'الرفض', en: 'Reject', es: 'Rechazo', pt: 'Rejeição', tr: 'Red' })}: <b className="text-rose-600 dark:text-rose-400">{fmtPct(r.rejet)}</b></span>
                  <span>{tx(lang, { fr: 'Ponctualité', ar: 'الالتزام', en: 'On-time', es: 'Puntualidad', pt: 'Pontualidade', tr: 'Zamanında' })}: <b>{fmtPct(r.ponctualite)}</b></span>
                  <span>{tx(lang, { fr: 'Retard moy.', ar: 'متوسط التأخير', en: 'Avg delay', es: 'Retraso medio', pt: 'Atraso médio', tr: 'Ort. gecikme' })}: <b>{fmtDays(r.retardMoyen)}</b></span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </SheetModal>
  );
}
