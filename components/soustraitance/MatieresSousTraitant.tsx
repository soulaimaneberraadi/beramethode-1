import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, AlertCircle, AlertTriangle, Send, RotateCcw, Scissors, Package } from 'lucide-react';
import { tx } from '../../lib/i18n';
import { fmt } from '../../app/constants';
import { useLang } from '../../src/context/LanguageContext';

/** Une ligne de besoin telle que retournée par `getFaconMaterialsNeeds` dans
 *  SousTraitance.tsx — on ne réimporte pas le type pour ne pas créer de
 *  dépendance circulaire, cette forme minimale suffit ici. */
export interface FaconMaterialNeed {
  id: string | number;
  name: string;
  unit: string;
  unitPrice: number;
  buyQty: number;
}

export type MaterialMoveSens = 'ENVOI' | 'RETOUR' | 'CHUTE';

export interface MaterialMove {
  id: string;
  orderId: string;
  materiau: string;
  unite?: string | null;
  sens: MaterialMoveSens;
  quantite: number;
  date?: string | null;
  note?: string | null;
  created_at?: string;
}

interface MatieresSousTraitantProps {
  orderId: string;
  /** Quantités contrôlées de la commande (acceptées + à retoucher + rejetées). */
  qtyAccepted: number;
  qtyToRepair: number;
  qtyRejected: number;
  totalQuantity: number;
  /** Besoins théoriques matière pour la commande ENTIÈRE (déjà calculés par
   *  `getFaconMaterialsNeeds` côté SousTraitance.tsx, passés en props pour ne
   *  pas dupliquer la logique de calcul de coût). */
  materialsNeeds: FaconMaterialNeed[];
  /** Masque la valorisation de l'écart quand le cloisonnement commercial est
   *  actif — mêmes règles que le reste du module (resolveCommercialAccess). */
  canSeeCost: boolean;
  currency: string;
}

const emptyForm = { materiau: '', unite: '', sens: 'ENVOI' as MaterialMoveSens, quantite: '' as number | '', date: new Date().toISOString().split('T')[0], note: '' };

const SENS_LABEL = (lang: string, sens: MaterialMoveSens) => {
  if (sens === 'ENVOI') return tx(lang, { fr: 'Envoi', ar: 'إرسال', en: 'Sent', es: 'Envío', pt: 'Envio', tr: 'Gönderim' });
  if (sens === 'RETOUR') return tx(lang, { fr: 'Retour', ar: 'إرجاع', en: 'Return', es: 'Devolución', pt: 'Devolução', tr: 'İade' });
  return tx(lang, { fr: 'Chute', ar: 'هدر', en: 'Waste', es: 'Merma', pt: 'Desperdício', tr: 'Fire' });
};

/**
 * Suivi matière envoyée / retournée / déclarée en chute avec le sous-traitant,
 * pour les commandes en mode Façon (c'est NOUS qui fournissons la matière).
 *
 * Formule de l'écart (voir aussi le commentaire sur la table en base,
 * server/db.ts) :
 *   consommé        = envoyé − retourné
 *   besoin prorata   = besoin théorique (fiche modèle, pour TOUTE la commande)
 *                       × (qtyAccepted + qtyToRepair + qtyRejected) / totalQuantity
 *   écart            = consommé − besoin prorata
 * Le prorata est nécessaire car le besoin théorique est calculé pour la
 * quantité TOTALE commandée, alors que la matière n'a pu être consommée que
 * pour les pièces déjà passées en contrôle (acceptées, à retoucher ou
 * rejetées) — comparer un consommé partiel à un besoin total ferait
 * apparaître un écart négatif artificiel tant que la commande n'est pas finie.
 * Un écart POSITIF veut dire : plus de matière consommée que ce que la fiche
 * prévoyait pour ce nombre de pièces — donc de la matière perdue quelque part
 * (chute non déclarée, vol, erreur de coupe...).
 */
export default function MatieresSousTraitant({ orderId, qtyAccepted, qtyToRepair, qtyRejected, totalQuantity, materialsNeeds, canSeeCost, currency }: MatieresSousTraitantProps) {
  const { lang } = useLang();
  const [moves, setMoves] = useState<MaterialMove[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/subcontract/materials/${orderId}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => { if (!cancelled) setMoves(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setError(tx(lang, { fr: 'Erreur de chargement des mouvements matière.', ar: 'خطأ فتحميل حركات المادة.', en: 'Error loading material moves.', es: 'Error al cargar los movimientos de material.', pt: 'Erro ao carregar os movimentos de material.', tr: 'Malzeme hareketleri yüklenirken hata.' })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId]);

  const ratio = totalQuantity > 0 ? Math.min(1, (qtyAccepted + qtyToRepair + qtyRejected) / totalQuantity) : 0;

  const rows = useMemo(() => {
    // Une matière peut avoir des mouvements sans figurer (ou plus) dans la
    // fiche modèle courante (modèle modifié depuis) : on l'affiche quand même,
    // avec un besoin théorique à 0 plutôt que de faire disparaître son suivi.
    const names = new Set<string>(materialsNeeds.map(m => m.name));
    moves.forEach(m => names.add(m.materiau));
    return Array.from(names).map(name => {
      const need = materialsNeeds.find(m => m.name === name);
      const unit = need?.unit || moves.find(m => m.materiau === name)?.unite || '';
      const envoye = moves.filter(m => m.materiau === name && m.sens === 'ENVOI').reduce((s, m) => s + (Number(m.quantite) || 0), 0);
      const retourne = moves.filter(m => m.materiau === name && m.sens === 'RETOUR').reduce((s, m) => s + (Number(m.quantite) || 0), 0);
      const chute = moves.filter(m => m.materiau === name && m.sens === 'CHUTE').reduce((s, m) => s + (Number(m.quantite) || 0), 0);
      const consomme = envoye - retourne;
      const besoinProrata = (need?.buyQty || 0) * ratio;
      const ecart = consomme - besoinProrata;
      return { name, unit, unitPrice: need?.unitPrice || 0, besoinTheorique: need?.buyQty || 0, besoinProrata, envoye, retourne, chute, consomme, ecart };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [materialsNeeds, moves, ratio]);

  const reload = async () => {
    try {
      const res = await fetch(`/api/subcontract/materials/${orderId}`, { credentials: 'include' });
      if (res.ok) setMoves(await res.json());
    } catch { /* on garde la liste précédente hors-ligne */ }
  };

  const handleAdd = async () => {
    if (!form.materiau.trim() || !(Number(form.quantite) > 0)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/subcontract/materials/${orderId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materiau: form.materiau.trim(),
          unite: form.unite.trim() || undefined,
          sens: form.sens,
          quantite: Number(form.quantite),
          date: form.date,
          note: form.note.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setForm(f => ({ ...emptyForm, sens: f.sens }));
      await reload();
    } catch {
      setError(tx(lang, { fr: "Échec de l'enregistrement du mouvement.", ar: 'فشل تسجيل الحركة.', en: 'Failed to save the move.', es: 'Error al guardar el movimiento.', pt: 'Falha ao guardar o movimento.', tr: 'Hareket kaydedilemedi.' }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/subcontract/materials/move/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      setMoves(prev => prev.filter(m => m.id !== id));
    } catch {
      setError(tx(lang, { fr: 'Échec de la suppression.', ar: 'فشل الحذف.', en: 'Failed to delete.', es: 'Error al eliminar.', pt: 'Falha ao eliminar.', tr: 'Silinemedi.' }));
    }
  };

  if (!materialsNeeds.length && !moves.length) return null;

  return (
    <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/60 border-b border-slate-200 dark:border-dk-border flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wide text-[10px]">
          {tx(lang, { fr: 'Matière avec le sous-traitant', ar: 'المادة مع المقاول من الباطن', en: 'Materials with subcontractor', es: 'Material con el subcontratista', pt: 'Material com o subcontratado', tr: 'Taşeronla malzeme' })}
        </h4>
        <span
          className="text-[9px] text-slate-400 dark:text-dk-muted font-semibold cursor-help"
          title={tx(lang, { fr: 'Écart = (envoyé − retourné) − besoin théorique × (pièces contrôlées / quantité commandée). Positif = matière consommée en plus de ce qui était prévu.', ar: 'الفرق = (المُرسَل − المُرجَع) − الاحتياج النظري × (القطع المراقَبة / الكمية المطلوبة). موجب = مادة استهلكت زيادة عن المتوقع.', en: 'Gap = (sent − returned) − theoretical need × (inspected pieces / ordered quantity). Positive = more material consumed than expected.', es: 'Desvío = (enviado − devuelto) − necesidad teórica × (piezas controladas / cantidad pedida). Positivo = más material consumido de lo previsto.', pt: 'Desvio = (enviado − devolvido) − necessidade teórica × (peças controladas / quantidade encomendada). Positivo = mais material consumido do que o previsto.', tr: 'Fark = (gönderilen − iade edilen) − teorik ihtiyaç × (kontrol edilen parça / sipariş miktarı). Pozitif = beklenenden fazla malzeme tüketildi.' })}
        >
          {tx(lang, { fr: 'Écart = consommé − besoin prorata', ar: 'الفرق = المستهلك − الاحتياج بالتناسب', en: 'Gap = consumed − prorated need', es: 'Desvío = consumido − necesidad prorrateada', pt: 'Desvio = consumido − necessidade proporcional', tr: 'Fark = tüketilen − orantılı ihtiyaç' })}
        </span>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="text-[10px] font-semibold leading-relaxed">{error}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-white dark:bg-dk-surface text-slate-400 dark:text-dk-muted uppercase tracking-wide text-[9px] border-b border-slate-100 dark:border-dk-border">
            <tr>
              <th className="px-4 py-2 text-left font-medium">{tx(lang, { fr: 'Matière', ar: 'المادة', en: 'Material', es: 'Material', pt: 'Material', tr: 'Malzeme' })}</th>
              <th className="px-3 py-2 text-center font-medium">{tx(lang, { fr: 'Besoin (prorata)', ar: 'الاحتياج (بالتناسب)', en: 'Need (prorated)', es: 'Necesidad (prorrateada)', pt: 'Necessidade (proporcional)', tr: 'İhtiyaç (orantılı)' })}</th>
              <th className="px-3 py-2 text-center font-medium">{tx(lang, { fr: 'Envoyé', ar: 'المرسَل', en: 'Sent', es: 'Enviado', pt: 'Enviado', tr: 'Gönderilen' })}</th>
              <th className="px-3 py-2 text-center font-medium">{tx(lang, { fr: 'Retourné', ar: 'المرجَع', en: 'Returned', es: 'Devuelto', pt: 'Devolvido', tr: 'İade edilen' })}</th>
              <th className="px-3 py-2 text-center font-medium">{tx(lang, { fr: 'Chutes', ar: 'الهدر', en: 'Waste', es: 'Mermas', pt: 'Desperdícios', tr: 'Fire' })}</th>
              <th className="px-3 py-2 text-center font-medium">{tx(lang, { fr: 'Consommé', ar: 'المستهلك', en: 'Consumed', es: 'Consumido', pt: 'Consumido', tr: 'Tüketilen' })}</th>
              <th className="px-4 py-2 text-center font-medium">{tx(lang, { fr: 'Écart', ar: 'الفرق', en: 'Gap', es: 'Desvío', pt: 'Desvio', tr: 'Fark' })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
            {rows.map(r => {
              const lost = r.ecart > 0.01;
              return (
                <tr key={r.name}>
                  <td className="px-4 py-2 font-semibold text-slate-700 dark:text-dk-text-soft">
                    <span className="inline-flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-slate-300 dark:text-dk-muted shrink-0" />
                      {r.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-slate-500 dark:text-dk-muted">{fmt(r.besoinProrata)} {r.unit}</td>
                  <td className="px-3 py-2 text-center">{fmt(r.envoye)} {r.unit}</td>
                  <td className="px-3 py-2 text-center">{fmt(r.retourne)} {r.unit}</td>
                  <td className="px-3 py-2 text-center text-slate-500 dark:text-dk-muted">{fmt(r.chute)} {r.unit}</td>
                  <td className="px-3 py-2 text-center font-semibold text-slate-700 dark:text-dk-text-soft">{fmt(r.consomme)} {r.unit}</td>
                  <td className={`px-4 py-2 text-center font-bold ${lost ? 'text-rose-600 dark:text-rose-400' : r.ecart < -0.01 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-dk-muted'}`}>
                    <span className="inline-flex items-center gap-1 justify-center">
                      {lost && <AlertTriangle className="w-3 h-3 shrink-0" />}
                      {fmt(r.ecart)} {r.unit}
                    </span>
                    {lost && canSeeCost && r.unitPrice > 0 && (
                      <div className="text-[9px] font-semibold text-rose-500 dark:text-rose-400/80">
                        {fmt(r.ecart * r.unitPrice)} {currency}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Journal des mouvements + formulaire d'ajout rapide */}
      <div className="px-4 py-3 border-t border-slate-100 dark:border-dk-border space-y-2.5">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 dark:text-dk-muted text-[11px] font-semibold py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{tx(lang, { fr: 'Chargement…', ar: 'جاري التحميل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yükleniyor…' })}</span>
          </div>
        ) : moves.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-dk-border">
            {moves.map(m => (
              <li key={m.id} className="flex items-center gap-2 py-1.5 text-[11px]">
                {m.sens === 'ENVOI' ? <Send className="w-3 h-3 text-sky-500 shrink-0" /> : m.sens === 'RETOUR' ? <RotateCcw className="w-3 h-3 text-emerald-500 shrink-0" /> : <Scissors className="w-3 h-3 text-amber-500 shrink-0" />}
                <span className="font-semibold text-slate-700 dark:text-dk-text-soft">{SENS_LABEL(lang, m.sens)}</span>
                <span className="text-slate-500 dark:text-dk-muted truncate flex-1">{m.materiau} — {fmt(m.quantite)} {m.unite || ''}</span>
                <span className="text-[9px] text-slate-400 dark:text-dk-muted shrink-0">{m.date || ''}</span>
                <button type="button" onClick={() => handleDelete(m.id)} className="p-1 text-slate-300 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 shrink-0">
                  <Trash2 className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-0.5">{tx(lang, { fr: 'Matière', ar: 'المادة', en: 'Material', es: 'Material', pt: 'Material', tr: 'Malzeme' })}</label>
            <input
              type="text"
              list="matieres-soustraitant-options"
              value={form.materiau}
              onChange={e => setForm(f => ({ ...f, materiau: e.target.value }))}
              className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-1.5 text-[11px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
              placeholder={tx(lang, { fr: 'Nom de la matière', ar: 'اسم المادة', en: 'Material name', es: 'Nombre del material', pt: 'Nome do material', tr: 'Malzeme adı' })}
            />
            <datalist id="matieres-soustraitant-options">
              {materialsNeeds.map(m => <option key={m.id} value={m.name} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-0.5">{tx(lang, { fr: 'Sens', ar: 'الاتجاه', en: 'Direction', es: 'Sentido', pt: 'Sentido', tr: 'Yön' })}</label>
            <select
              value={form.sens}
              onChange={e => setForm(f => ({ ...f, sens: e.target.value as MaterialMoveSens }))}
              className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-1.5 text-[11px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
            >
              <option value="ENVOI">{SENS_LABEL(lang, 'ENVOI')}</option>
              <option value="RETOUR">{SENS_LABEL(lang, 'RETOUR')}</option>
              <option value="CHUTE">{SENS_LABEL(lang, 'CHUTE')}</option>
            </select>
          </div>
          <div className="w-24">
            <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-0.5">{tx(lang, { fr: 'Quantité', ar: 'الكمية', en: 'Quantity', es: 'Cantidad', pt: 'Quantidade', tr: 'Miktar' })}</label>
            <input
              type="number"
              value={form.quantite}
              onChange={e => setForm(f => ({ ...f, quantite: e.target.value === '' ? '' : Number(e.target.value) }))}
              placeholder="0"
              className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-1.5 text-[11px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
            />
          </div>
          <div className="w-36">
            <label className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase mb-0.5">{tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' })}</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-1.5 text-[11px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
            />
          </div>
          <button
            type="button"
            disabled={saving || !form.materiau.trim() || !(Number(form.quantite) > 0)}
            onClick={handleAdd}
            className="shrink-0 bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent/90 text-white px-3 py-1.5 rounded-lg font-bold text-[10px] transition-colors flex items-center gap-1 disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Añadir', pt: 'Adicionar', tr: 'Ekle' })}
          </button>
        </div>
      </div>
    </div>
  );
}
