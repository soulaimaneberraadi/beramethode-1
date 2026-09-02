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
import { variantCode, attachScannerListener, type VariantAxes } from '../lib/scanner';
import { renderEAN13 } from '../lib/barcode';
import { X, Search, ArrowLeft, Barcode, Package, AlertTriangle, Printer, Layers, Check, Pencil, ScanLine, Loader2, ShieldCheck } from 'lucide-react';

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
  /** Écrit la carte `code → (taille, couleur)` du produit. Renvoie le nombre
   *  de codes ajoutés. Sans elle, la page reste en lecture seule. */
  onSaveCodes?: (
    model: ModelData,
    entrees: Array<{ code: string; taille: string; couleur: string }>,
  ) => Promise<number>;
};

/** Ce que le programme SAIT d'un produit : un code enregistré est un code que
 *  le lecteur reconnaîtra à coup sûr, même si la fiche change demain. Un code
 *  seulement calculé se lit encore, mais par déduction — et la déduction
 *  s'écroule dès qu'on renomme une taille. */
const codesEnregistres = (model: ModelData): Record<string, { taille: string; couleur: string }> =>
  ((model.meta_data as any)?.variantCodes || {}) as Record<string, { taille: string; couleur: string }>;

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
  open, onClose, entries, stockMatrix, axesOf, currency, lang, fmtDate, onPrint, initialModelId, onSaveCodes,
}) => {
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState<ModelData | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  /** Case dont on saisit le code à la main ou au lecteur. */
  const [saisie, setSaisie] = useState<{ couleur: string; taille: string; valeur: string } | null>(null);

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
    nonEnregistre: tx(lang, { fr: 'Sans tiki : le lecteur ne connaît pas encore ce produit.', ar: 'بلا تيكي: السكانير مازال ما كيعرفش هاد المنتوج.', en: 'No label: the scanner does not know this product yet.', es: 'Sin etiqueta: el lector aun no conoce este producto.', pt: 'Sem etiqueta: o leitor ainda nao conhece este produto.', tr: 'Etiket yok: okuyucu bu urunu henuz tanimiyor.' }),
    partiel: tx(lang, { fr: 'Tiki incomplet : certaines cases ne sont pas enregistrées.', ar: 'التيكي ناقص: بعض الخانات مازال ما مسجّلينش.', en: 'Incomplete: some cells are not registered.', es: 'Incompleto: algunas casillas no estan registradas.', pt: 'Incompleto: algumas celulas nao estao registadas.', tr: 'Eksik: bazi hucreler kayitli degil.' }),
    enregistrer: tx(lang, { fr: 'Enregistrer les codes', ar: 'سجّل الأكواد', en: 'Register the codes', es: 'Registrar los codigos', pt: 'Registar os codigos', tr: 'Kodlari kaydet' }),
    enregistre: tx(lang, { fr: 'Enregistré', ar: 'مسجّل', en: 'Registered', es: 'Registrado', pt: 'Registado', tr: 'Kayitli' }),
    calcule: tx(lang, { fr: 'Calculé — pas encore enregistré', ar: 'محسوب — مازال ما تسجّلش', en: 'Computed - not registered yet', es: 'Calculado - aun no registrado', pt: 'Calculado - ainda nao registado', tr: 'Hesaplandi - henuz kayitli degil' }),
    propre: tx(lang, { fr: 'Code du fournisseur', ar: 'كود المورّد', en: "Supplier's code", es: 'Codigo del proveedor', pt: 'Codigo do fornecedor', tr: 'Tedarikci kodu' }),
    saisir: tx(lang, { fr: 'Scannez le tiki existant, ou tapez son code', ar: 'سكاني التيكي الموجود، ولا كتب الكود', en: 'Scan the existing label, or type its code', es: 'Escanee la etiqueta existente o escriba su codigo', pt: 'Leia a etiqueta existente ou escreva o codigo', tr: 'Mevcut etiketi okutun veya kodunu yazin' }),
    valider: tx(lang, { fr: 'Valider', ar: 'تأكيد', en: 'Confirm', es: 'Confirmar', pt: 'Confirmar', tr: 'Onayla' }),
    annuler: tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'Iptal' }),
    fait: tx(lang, { fr: 'codes enregistrés.', ar: 'كود تسجّلو.', en: 'codes registered.', es: 'codigos registrados.', pt: 'codigos registados.', tr: 'kod kaydedildi.' }),
    rienAFaire: tx(lang, { fr: 'Tout était déjà enregistré.', ar: 'كلشي كان مسجّل من قبل.', en: 'Everything was already registered.', es: 'Todo ya estaba registrado.', pt: 'Tudo ja estava registado.', tr: 'Her sey zaten kayitliydi.' }),
    echec: tx(lang, { fr: "L'enregistrement n'a pas abouti.", ar: 'التسجيل ما نجحش.', en: 'The registration failed.', es: 'El registro no se completo.', pt: 'O registo nao foi concluido.', tr: 'Kayit tamamlanmadi.' }),
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

  /**
   * L'état d'un produit vis-à-vis du lecteur. On ne juge QUE les cases qui ont
   * de la marchandise : exiger un code pour une case vide ferait clignoter en
   * rouge un produit parfaitement vendable.
   *
   *   'aucun'   — rien d'enregistré : le comptoir ne le reconnaît pas.
   *   'partiel' — des pièces en stock sans code enregistré.
   *   'ok'      — chaque pièce présente est reconnaissable à coup sûr.
   */
  const etatDe = useCallback((model: ModelData): { etat: 'aucun' | 'partiel' | 'ok'; manquants: number } => {
    const axes = axesOf(model);
    const cells = stockMatrix.get(model.id);
    const map = codesEnregistres(model);
    const enregistres = new Set(
      Object.entries(map).map(([, v]) => cellKey(v.couleur, v.taille))
    );
    let avecStock = 0;
    let manquants = 0;
    for (const couleur of axes.colors) {
      for (const taille of axes.sizes) {
        const k = cellKey(couleur, taille);
        if (!(Number(cells?.get(k) || 0) > 0)) continue;
        avecStock++;
        if (!enregistres.has(k)) manquants++;
      }
    }
    if (Object.keys(map).length === 0) return { etat: 'aucun', manquants: avecStock };
    return { etat: manquants > 0 ? 'partiel' : 'ok', manquants };
  }, [axesOf, stockMatrix]);

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
      return { ...e, nbCases, nbCodes, cellsPleines, ...etatDe(e.model) };
    });
    if (!q) return avecMesure;
    return avecMesure.filter(e => {
      const nom = (e.model.meta_data?.nom_modele || '').toLowerCase();
      const ref = (e.model.meta_data?.reference || '').toLowerCase();
      return nom.includes(q) || ref.includes(q) || String(e.model.id).includes(q);
    });
  }, [entries, recherche, stockMatrix, axesOf, etatDe]);

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
    const map = codesEnregistres(ouvert);
    const lignes = axes.colors.flatMap(couleur =>
      axes.sizes.map(taille => {
        const qte = Number(cells?.get(cellKey(couleur, taille)) || 0);
        /* Un code ENREGISTRÉ pour cette case prime sur le code calculé : c'est
         * lui que le lecteur trouvera en premier, et il peut venir d'un
         * fournisseur — donc n'avoir aucun rapport avec notre formule. */
        const enregistre = Object.entries(map).find(
          ([, v]) => v.couleur === couleur && v.taille === taille
        )?.[0] || null;
        return {
          couleur,
          taille,
          qte,
          code: enregistre || variantCode(ouvert, couleur, taille, axes),
          enregistre: Boolean(enregistre),
          horsFiche: !ficheSizes.includes(taille) || !ficheColors.includes(couleur),
        };
      })
    );
    const total = lignes.reduce((a, l) => a + Math.max(0, l.qte), 0);
    return { axes, lignes, total };
  }, [ouvert, axesOf, stockMatrix]);

  const ouvrir = useCallback((m: ModelData) => setOuvert(m), []);

  /** Enregistre d'un coup les codes calculés de toutes les cases codables.
   *  C'est le geste qui fait passer un produit de « le lecteur devine » à
   *  « le lecteur sait ». */
  const enregistrerTout = useCallback(async () => {
    if (!ouvert || !onSaveCodes || enregistrement) return;
    const axes = axesOf(ouvert);
    const entrees: Array<{ code: string; taille: string; couleur: string }> = [];
    for (const couleur of axes.colors) {
      for (const taille of axes.sizes) {
        const code = variantCode(ouvert, couleur, taille, axes);
        if (code) entrees.push({ code, taille, couleur });
      }
    }
    setEnregistrement(true);
    try {
      const n = await onSaveCodes(ouvert, entrees);
      setFlash(n > 0 ? { ok: true, msg: `${n} ${T.fait}` } : { ok: true, msg: T.rienAFaire });
    } catch {
      setFlash({ ok: false, msg: T.echec });
    } finally {
      setEnregistrement(false);
    }
  }, [ouvert, onSaveCodes, enregistrement, axesOf, T.fait, T.rienAFaire, T.echec]);

  /** Un code saisi à la main ou lu au lecteur, rattaché à UNE case. C'est la
   *  voie pour la marchandise achetée qui porte déjà l'étiquette de son
   *  fournisseur : on l'adopte au lieu de la recouvrir. */
  const validerSaisie = useCallback(async () => {
    if (!ouvert || !onSaveCodes || !saisie) return;
    const code = saisie.valeur.trim();
    if (!code) { setSaisie(null); return; }
    setEnregistrement(true);
    try {
      const n = await onSaveCodes(ouvert, [{ code, taille: saisie.taille, couleur: saisie.couleur }]);
      setFlash(n > 0 ? { ok: true, msg: `1 ${T.fait}` } : { ok: true, msg: T.rienAFaire });
      setSaisie(null);
    } catch {
      setFlash({ ok: false, msg: T.echec });
    } finally {
      setEnregistrement(false);
    }
  }, [ouvert, onSaveCodes, saisie, T.fait, T.rienAFaire, T.echec]);

  /* Pendant la saisie d'une case, le lecteur remplit le champ : présenter la
   * pièce est plus sûr que recopier treize chiffres à la main. */
  useEffect(() => {
    if (!open || !saisie) return;
    return attachScannerListener(code => {
      setSaisie(prev => (prev ? { ...prev, valeur: code } : prev));
    });
  }, [open, saisie?.couleur, saisie?.taille]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3000);
    return () => clearTimeout(t);
  }, [flash]);

  const etatOuvert = ouvert ? etatDe(ouvert) : null;

  /* Ouvrir un produit que le lecteur ne connaît PAS DU TOUT l'enregistre sur
   * place. Laisser le geste à faire à la main garantissait qu'il serait
   * oublié, et la panne ne se serait vue qu'au comptoir, client devant soi.
   *
   * Seul le cas « rien d'enregistré » est automatique : un produit
   * partiellement enregistré porte peut-être des codes de fournisseur choisis
   * exprès, et compléter tout seul reviendrait à décider à sa place. */
  const autoFait = useRef<string | null>(null);
  useEffect(() => {
    if (!ouvert || !onSaveCodes) return;
    const id = String(ouvert.id);
    if (autoFait.current === id) return;
    if (etatDe(ouvert).etat !== 'aucun') return;
    autoFait.current = id;
    void enregistrerTout();
  }, [ouvert, onSaveCodes, etatDe, enregistrerTout]);

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
                      <div className="relative flex-none">
                        <Vignette model={e.model} className="w-14 h-14" />
                        {/* La pastille dit, sans lire un chiffre, si le comptoir
                            reconnaîtra ce produit. Rouge : il ne le connaît pas. */}
                        {e.etat !== 'ok' && (
                          <span
                            className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full ring-2 ring-white dark:ring-dk-surface ${
                              e.etat === 'aucun' ? 'bg-rose-500' : 'bg-amber-500'
                            }`}
                          />
                        )}
                      </div>
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
                    {e.etat !== 'ok' && (
                      <p className={`flex items-start gap-1.5 mt-2 text-[10px] font-semibold leading-relaxed ${
                        e.etat === 'aucun' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'
                      }`}>
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                        {e.etat === 'aucun' ? T.nonEnregistre : T.partiel}
                      </p>
                    )}
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

            {/* L'état, en toutes lettres, avec le geste qui le corrige juste à
                côté : constater sans pouvoir agir n'aide personne. */}
            {etatOuvert && etatOuvert.etat !== 'ok' && (
              <div className={`flex flex-wrap items-center gap-3 p-3 rounded-2xl mb-4 border ${
                etatOuvert.etat === 'aucun'
                  ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50'
              }`}>
                <AlertTriangle className={`w-5 h-5 shrink-0 ${etatOuvert.etat === 'aucun' ? 'text-rose-500' : 'text-amber-500'}`} />
                <p className={`flex-1 min-w-[12rem] text-xs font-semibold leading-relaxed ${
                  etatOuvert.etat === 'aucun' ? 'text-rose-700 dark:text-rose-300' : 'text-amber-800 dark:text-amber-300'
                }`}>
                  {etatOuvert.etat === 'aucun' ? T.nonEnregistre : T.partiel}
                </p>
                {onSaveCodes && (
                  <button
                    type="button"
                    onClick={enregistrerTout}
                    disabled={enregistrement}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 dark:bg-dk-accent text-white hover:bg-slate-900 dark:hover:bg-dk-accent/90 disabled:opacity-60 transition-colors"
                  >
                    {enregistrement ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    {T.enregistrer}
                  </button>
                )}
              </div>
            )}

            {flash && (
              <p className={`mb-4 px-3 py-2 rounded-xl text-xs font-bold ${
                flash.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400'
              }`}>
                {flash.msg}
              </p>
            )}

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

                  {saisie && saisie.couleur === l.couleur && saisie.taille === l.taille ? (
                    /* Saisie d'un code existant : le lecteur remplit le champ
                       tout seul, le clavier reste le repli. */
                    <div className="rounded-xl bg-slate-50 dark:bg-dk-bg p-2">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 dark:text-dk-accent mb-1.5">
                        <ScanLine className="w-3.5 h-3.5 animate-pulse" /> {T.saisir}
                      </p>
                      <input
                        autoFocus
                        value={saisie.valeur}
                        onChange={e => setSaisie(prev => (prev ? { ...prev, valeur: e.target.value } : prev))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void validerSaisie(); } }}
                        className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-xs font-mono font-bold text-slate-700 dark:text-dk-text outline-none focus:border-indigo-400 dark:focus:border-dk-accent"
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={validerSaisie}
                          disabled={enregistrement || !saisie.valeur.trim()}
                          className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800 dark:bg-dk-accent text-white disabled:opacity-50"
                        >
                          {T.valider}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSaisie(null)}
                          className="px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated"
                        >
                          {T.annuler}
                        </button>
                      </div>
                    </div>
                  ) : l.code ? (
                    <div className="rounded-xl bg-slate-50 dark:bg-dk-bg p-2 flex flex-col items-center">
                      <CodeBarres code={l.code} />
                      <p className="mt-1 text-[11px] font-mono font-bold tracking-wider text-slate-600 dark:text-dk-text-soft">{l.code}</p>
                      <div className="mt-1.5 w-full flex items-center gap-2">
                        <span className={`flex items-center gap-1 text-[9px] font-bold ${
                          l.enregistre ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                        }`}>
                          {l.enregistre ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          {l.enregistre ? T.enregistre : T.calcule}
                        </span>
                        <span className="flex-1" />
                        {onSaveCodes && (
                          <button
                            type="button"
                            onClick={() => setSaisie({ couleur: l.couleur, taille: l.taille, valeur: '' })}
                            title={T.propre}
                            className="flex items-center gap-1 text-[9px] font-bold text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent transition-colors"
                          >
                            <Pencil className="w-3 h-3" /> {T.propre}
                          </button>
                        )}
                      </div>
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
