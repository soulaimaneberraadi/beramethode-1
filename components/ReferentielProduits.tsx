/**
 * Référentiel produits — LA page où chaque pièce vendable porte son code.
 *
 * Jusqu'ici l'information était éclatée : la fiche d'un côté, le stock de
 * l'autre, et les codes-barres nulle part — on ne pouvait pas SAVOIR, avant
 * d'imprimer, quel code allait sortir ni s'il désignait une case réelle.
 * Cette page rassemble les trois : un produit, ses cases (couleur × taille),
 * la quantité présente et le code unique de chacune, lisible à l'œil.
 *
 * Elle ne calcule aucun code elle-même : elle affiche `variantCode` sur les
 * axes que le reste du module utilise déjà. Une seconde source de vérité ici
 * serait exactement la panne qu'on vient de réparer.
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ModelData } from '../types';
import { tx } from '../lib/i18n';
import { fmt } from '../app/constants';
import { variantCode, type VariantAxes } from '../lib/scanner';
import { renderEAN13 } from '../lib/barcode';
import { X, Search, ArrowLeft, Barcode, Package, AlertTriangle, Printer, Layers } from 'lucide-react';

export type ReferentielEntry = {
  model: ModelData;
  salePrice: number | null;
  remainingStock: number;
  date?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  entries: ReferentielEntry[];
  /** `couleur|taille` → quantité, par modèle. La même carte que partout. */
  stockMatrix: Map<string, Map<string, number>>;
  axesOf: (model: ModelData) => VariantAxes;
  currency: string;
  lang: string;
  fmtDate: (v?: string | null) => string;
  /** Ouvre l'atelier d'impression sur ce modèle. */
  onPrint?: (model: ModelData) => void;
  /** Produit à afficher d'emblée : le bouton code-barres d'une carte ouvre le
   *  détail de CE produit, pas la liste — sinon il faudrait le rechercher
   *  alors qu'on venait de cliquer dessus. */
  initialModelId?: string | null;
};

const cellKey = (c: string, t: string) => `${c || ''}|${t || ''}`;

/** Photo du produit, ou ses initiales — jamais un carré vide qui ne dit rien. */
const Vignette: React.FC<{ model: ModelData; className?: string }> = ({ model, className = 'w-12 h-12' }) => {
  const src = (model as any).image || (model as any).photo || '';
  const nom = model.meta_data?.nom_modele || '';
  if (src) return <img src={src} alt="" className={`${className} rounded-xl object-cover bg-slate-100 dark:bg-dk-elevated flex-none`} />;
  return (
    <div className={`${className} rounded-xl bg-slate-100 dark:bg-dk-elevated flex-none flex items-center justify-center text-[11px] font-black text-slate-400 dark:text-dk-muted`}>
      {nom.slice(0, 2).toUpperCase() || '—'}
    </div>
  );
};

/** Le code-barres tel qu'il sortira sur le tiki. Le dessiner ici évite le
 *  aller-retour « j'imprime pour voir » sur un rouleau thermique. */
const CodeBarres: React.FC<{ code: string }> = ({ code }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (ref.current && code) renderEAN13(ref.current, code, { height: 34, module: 1.4, quiet: 4 });
  }, [code]);
  if (!code) return null;
  return <canvas ref={ref} className="max-w-full h-auto" />;
};

const ReferentielProduits: React.FC<Props> = ({
  open, onClose, entries, stockMatrix, axesOf, currency, lang, fmtDate, onPrint, initialModelId,
}) => {
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState<ModelData | null>(null);

  const T = {
    titre: tx(lang, { fr: 'Référentiel produits', ar: 'قاعدة المنتجات', en: 'Product reference', es: 'Referencial de productos', pt: 'Referencial de produtos', tr: 'Ürün referansı' }),
    sous: tx(lang, { fr: 'Chaque case a son code : le lecteur reconnaît la pièce par lui.', ar: 'كل خانة عندها الكود ديالها: السكانير كيعرف القطعة بيه.', en: 'Every cell has its code: the scanner recognizes the item by it.', es: 'Cada casilla tiene su código: el lector reconoce la pieza por él.', pt: 'Cada celula tem o seu codigo: o leitor reconhece a peca por ele.', tr: 'Her hucrenin kodu var: okuyucu parcayi bununla taniyor.' }),
    chercher: tx(lang, { fr: 'Chercher un produit...', ar: 'قلّب على منتوج...', en: 'Search a product...', es: 'Buscar un producto...', pt: 'Procurar um produto...', tr: 'Urun ara...' }),
    retour: tx(lang, { fr: 'Retour', ar: 'رجوع', en: 'Back', es: 'Volver', pt: 'Voltar', tr: 'Geri' }),
    ref: tx(lang, { fr: 'Référence', ar: 'المرجع', en: 'Reference', es: 'Referencia', pt: 'Referencia', tr: 'Referans' }),
    date: tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' }),
    prix: tx(lang, { fr: 'Prix de vente', ar: 'ثمن البيع', en: 'Sale price', es: 'Precio de venta', pt: 'Preco de venda', tr: 'Satis fiyati' }),
    pieces: tx(lang, { fr: 'Pièces', ar: 'قطعة', en: 'Pieces', es: 'Piezas', pt: 'Pecas', tr: 'Parca' }),
    cases: tx(lang, { fr: 'Cases', ar: 'خانة', en: 'Cells', es: 'Casillas', pt: 'Celulas', tr: 'Hucre' }),
    codes: tx(lang, { fr: 'Codes', ar: 'كود', en: 'Codes', es: 'Codigos', pt: 'Codigos', tr: 'Kod' }),
    couleur: tx(lang, { fr: 'Couleur', ar: 'اللون', en: 'Color', es: 'Color', pt: 'Cor', tr: 'Renk' }),
    taille: tx(lang, { fr: 'Taille', ar: 'المقاس', en: 'Size', es: 'Talla', pt: 'Tamanho', tr: 'Beden' }),
    imprimer: tx(lang, { fr: 'Imprimer les tiki', ar: 'طبع التيكيات', en: 'Print labels', es: 'Imprimir etiquetas', pt: 'Imprimir etiquetas', tr: 'Etiket yazdir' }),
    vide: tx(lang, { fr: 'Aucun produit.', ar: 'ما كاين حتى منتوج.', en: 'No product.', es: 'Ningun producto.', pt: 'Nenhum produto.', tr: 'Urun yok.' }),
    sansCode: tx(lang, { fr: 'Pas de code : cette case dépasse ce que la formule peut coder (10 tailles × 10 couleurs).', ar: 'بلا كود: هاد الخانة فايتة لي كتقدر الصيغة تكودي (10 مقاسات × 10 ألوان).', en: 'No code: this cell exceeds what the formula can encode (10 sizes x 10 colors).', es: 'Sin codigo: esta casilla supera lo que la formula puede codificar.', pt: 'Sem codigo: esta celula excede o que a formula consegue codificar.', tr: 'Kod yok: bu hucre formulun kodlayabilecegini asiyor.' }),
    horsFiche: tx(lang, { fr: 'Case absente de la fiche : le stock est entré par la commande sous ce libellé.', ar: 'خانة ماشي فالبطاقة: الستوك دخل من الطلبية بهاد التسمية.', en: 'Cell missing from the record: stock came in from the order under this label.', es: 'Casilla ausente de la ficha: el stock entro por el pedido con esta etiqueta.', pt: 'Celula ausente da ficha: o stock entrou pela encomenda com este rotulo.', tr: 'Karttan eksik hucre: stok siparisten bu etiketle girdi.' }),
  };

  /* Fermer à l'échap, et remonter d'abord du détail vers la liste : la touche
   * doit défaire le dernier geste, pas tout le parcours. */
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (ouvert) setOuvert(null);
      else onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, ouvert, onClose]);

  useEffect(() => {
    if (!open) { setOuvert(null); setRecherche(''); return; }
    if (!initialModelId) return;
    const m = entries.find(e => String(e.model.id) === String(initialModelId));
    if (m) setOuvert(m.model);
  }, [open, initialModelId, entries]);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const avecMesure = entries.map(e => {
      const cells = stockMatrix.get(e.model.id);
      const axes = axesOf(e.model);
      const nbCases = axes.sizes.length * axes.colors.length;
      const nbCodes = axes.sizes.reduce(
        (acc, t) => acc + axes.colors.reduce((a, c) => a + (variantCode(e.model, c, t, axes) ? 1 : 0), 0),
        0
      );
      const cellsPleines = Array.from(cells?.values() || []).filter(v => Number(v) > 0).length;
      return { ...e, nbCases, nbCodes, cellsPleines };
    });
    if (!q) return avecMesure;
    return avecMesure.filter(e => {
      const nom = (e.model.meta_data?.nom_modele || '').toLowerCase();
      const ref = (e.model.meta_data?.reference || '').toLowerCase();
      return nom.includes(q) || ref.includes(q) || String(e.model.id).includes(q);
    });
  }, [entries, recherche, stockMatrix, axesOf]);

  /** Le détail d'un produit : une ligne par case existante, son code, sa
   *  quantité. On montre TOUTES les cases des axes, pas seulement celles qui
   *  ont du stock — sinon on ne peut pas préparer l'étiquette d'une pièce qui
   *  arrive demain. */
  const detail = useMemo(() => {
    if (!ouvert) return null;
    const axes = axesOf(ouvert);
    const cells = stockMatrix.get(ouvert.id);
    const fiche: any = ouvert.ficheData || {};
    const ficheSizes: string[] = (fiche.sizes || []).map((s: any) => String(s));
    const ficheColors: string[] = (fiche.colors || []).map((c: any) => String(c?.name ?? ''));
    const lignes = axes.colors.flatMap(couleur =>
      axes.sizes.map(taille => {
        const qte = Number(cells?.get(cellKey(couleur, taille)) || 0);
        return {
          couleur,
          taille,
          qte,
          code: variantCode(ouvert, couleur, taille, axes),
          horsFiche: !ficheSizes.includes(taille) || !ficheColors.includes(couleur),
        };
      })
    );
    const total = lignes.reduce((a, l) => a + Math.max(0, l.qte), 0);
    return { axes, lignes, total };
  }, [ouvert, axesOf, stockMatrix]);

  const ouvrir = useCallback((m: ModelData) => setOuvert(m), []);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex flex-col bg-slate-100 dark:bg-dk-bg">
      {/* Entête : ce qu'on regarde, et par où on sort. */}
      <div className="shrink-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border">
        {ouvert ? (
          <button
            type="button"
            onClick={() => setOuvert(null)}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{T.retour}</span>
          </button>
        ) : (
          <Layers className="w-5 h-5 text-indigo-600 dark:text-dk-accent shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-extrabold text-slate-800 dark:text-dk-text text-sm sm:text-base truncate">
            {ouvert ? (ouvert.meta_data?.nom_modele || ouvert.id) : T.titre}
          </p>
          <p className="hidden sm:block text-[11px] text-slate-400 dark:text-dk-muted truncate">
            {ouvert ? (ouvert.meta_data?.reference || String(ouvert.id)) : T.sous}
          </p>
        </div>
        <div className="flex-1 min-w-0" />
        {ouvert && onPrint && (
          <button
            type="button"
            onClick={() => { onPrint(ouvert); onClose(); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shrink-0"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">{T.imprimer}</span>
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-2 rounded-xl text-slate-400 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!ouvert ? (
          <div className="p-3 sm:p-5">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-dk-muted pointer-events-none" />
              <input
                value={recherche}
                onChange={e => setRecherche(e.target.value)}
                placeholder={T.chercher}
                className="w-full pl-9 pr-3 py-3 rounded-2xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-sm text-slate-700 dark:text-dk-text outline-none focus:border-indigo-400 dark:focus:border-dk-accent"
              />
            </div>

            {liste.length === 0 ? (
              <p className="text-center text-sm text-slate-400 dark:text-dk-muted py-16">{T.vide}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {liste.map(e => (
                  <button
                    key={e.model.id}
                    type="button"
                    onClick={() => ouvrir(e.model)}
                    className="text-left p-3 rounded-2xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:border-indigo-300 dark:hover:border-dk-accent transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <Vignette model={e.model} className="w-14 h-14" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-slate-800 dark:text-dk-text truncate">
                          {e.model.meta_data?.nom_modele || e.model.id}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-dk-muted truncate">
                          {e.model.meta_data?.reference || String(e.model.id)}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-dk-muted mt-0.5">
                          {T.date} · {fmtDate(e.date)}
                        </p>
                      </div>
                      {e.salePrice != null && e.salePrice > 0 && (
                        <span className="shrink-0 text-[11px] font-bold text-slate-600 dark:text-dk-text-soft">
                          {fmt(e.salePrice)} {currency}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-slate-50 dark:bg-dk-bg px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-dk-muted">{T.pieces}</p>
                        <p className="text-sm font-black text-slate-700 dark:text-dk-text">{e.remainingStock.toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 dark:bg-dk-bg px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-dk-muted">{T.cases}</p>
                        <p className="text-sm font-black text-slate-700 dark:text-dk-text">{e.cellsPleines}/{e.nbCases}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 dark:bg-dk-bg px-2 py-1.5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-dk-muted">{T.codes}</p>
                        <p className={`text-sm font-black ${e.nbCodes < e.nbCases ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {e.nbCodes}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 sm:p-5">
            {/* Carte d'identité du produit, puis ses cases une à une. */}
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border mb-4">
              <Vignette model={ouvert} className="w-20 h-20" />
              <div className="min-w-0 flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-dk-muted">{T.ref}</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-dk-text truncate">{ouvert.meta_data?.reference || String(ouvert.id)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-dk-muted">{T.date}</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-dk-text truncate">
                    {fmtDate(entries.find(x => x.model.id === ouvert.id)?.date)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-dk-muted">{T.prix}</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-dk-text truncate">
                    {(() => { const p = entries.find(x => x.model.id === ouvert.id)?.salePrice; return p ? `${fmt(p)} ${currency}` : '—'; })()}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-dk-muted">{T.pieces}</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-dk-text">{(detail?.total || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {detail?.lignes.map(l => (
                <div
                  key={`${l.couleur}|${l.taille}`}
                  className={`p-3 rounded-2xl bg-white dark:bg-dk-surface border ${
                    l.qte > 0 ? 'border-slate-200 dark:border-dk-border' : 'border-dashed border-slate-200 dark:border-dk-border opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-dk-muted">{T.couleur}</p>
                      <p className="text-xs font-bold text-slate-700 dark:text-dk-text truncate">{l.couleur || '—'}</p>
                    </div>
                    <div className="shrink-0 text-center px-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-dk-muted">{T.taille}</p>
                      <p className="text-xs font-black text-slate-700 dark:text-dk-text">{l.taille || '—'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-dk-muted">{T.pieces}</p>
                      <p className={`text-sm font-black ${l.qte > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-dk-muted'}`}>
                        {l.qte}
                      </p>
                    </div>
                  </div>

                  {l.code ? (
                    <div className="rounded-xl bg-slate-50 dark:bg-dk-bg p-2 flex flex-col items-center">
                      <CodeBarres code={l.code} />
                      <p className="mt-1 text-[11px] font-mono font-bold tracking-wider text-slate-600 dark:text-dk-text-soft">{l.code}</p>
                    </div>
                  ) : (
                    <p className="flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      {T.sansCode}
                    </p>
                  )}

                  {l.horsFiche && (
                    <p className="flex items-start gap-1.5 mt-2 text-[10px] text-slate-400 dark:text-dk-muted leading-relaxed">
                      <Package className="w-3.5 h-3.5 shrink-0 mt-px" />
                      {T.horsFiche}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ReferentielProduits;
export { Barcode as ReferentielIcon };
