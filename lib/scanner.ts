/**
 * Décodage des tikis, partagé.
 *
 * Deux écrans lisent la MÊME étiquette : « Stock & Ventes » (sortie de stock)
 * et la Caisse. S'ils gardaient chacun leur copie du décodage, le jour où l'un
 * évolue le même tiki se lirait de deux façons différentes — et personne ne
 * s'en apercevrait avant qu'une vente ne sorte la mauvaise pièce du stock.
 */
import type { ModelData } from '../types';
import { ean13FromDigits, ean13Variant, parseScanCode } from './barcode';

export type ScanHit = { model: ModelData; taille: string; couleur: string };

/** Les deux axes d'une variante, dans l'ordre qui donne son index a chaque
 *  code-barres. */
export type VariantAxes = { sizes: string[]; colors: string[] };

/** Une cellule de stock, `couleur|taille` — la clé utilisée partout ailleurs. */
export type CellKeys = Iterable<string>;

const norm = (s?: string) => (s || '').trim().toUpperCase();

/**
 * Axes de variante d'un modèle : ceux de la fiche D'ABORD (leur ordre est
 * celui qu'on imprime et qu'on trie), puis les libellés qui n'existent que
 * dans les mouvements de stock, ajoutés à la fin.
 *
 * Le stock arrive de la COMMANDE, qui a sa propre grille ; la fiche est
 * saisie ailleurs et peut ne jamais la rejoindre — on a vu 100 % du stock
 * rangé sous « s/m/l » pendant que la fiche annonçait « 36/38/40 ». Sans
 * cette union, ces pièces n'ont aucun code : le tiki imprimé désigne une case
 * vide, et la caisse refuse une vente pour une pièce qui est dans la main du
 * vendeur.
 *
 * Les libellés ajoutés sont triés : l'index d'une variante doit être le même
 * d'une session à l'autre, sinon un tiki imprimé hier se lirait autrement
 * aujourd'hui. (La carte `variantCodes`, écrite à l'impression, reste la
 * source qui fait foi ; ceci n'est que le repli.)
 */
export function variantAxes(model: ModelData, cells?: CellKeys): VariantAxes {
  const fiche: any = model.ficheData || {};
  const sizes: string[] = (fiche.sizes || []).map((s: any) => String(s));
  const colors: string[] = (fiche.colors || []).map((c: any) => String(c?.name ?? ''));
  const extraSizes: string[] = [];
  const extraColors: string[] = [];
  for (const raw of cells || []) {
    const k = String(raw);
    const i = k.indexOf('|');
    if (i < 0) continue;
    const c = k.slice(0, i);
    const t = k.slice(i + 1);
    if (t && !sizes.includes(t) && !extraSizes.includes(t)) extraSizes.push(t);
    if (c && !colors.includes(c) && !extraColors.includes(c)) extraColors.push(c);
  }
  extraSizes.sort();
  extraColors.sort();
  return { sizes: [...sizes, ...extraSizes], colors: [...colors, ...extraColors] };
}

/** Les cellules de stock d'un modèle, telles que les tient l'appelant. */
export type AxesLookup = (model: ModelData) => VariantAxes;

const axesFromFiche: AxesLookup = model => variantAxes(model);

/**
 * EAN-13 « variante » → (modèle, taille, couleur).
 * D'abord la carte enregistrée à l'impression (`meta_data.variantCodes`), puis
 * un repli calculé pour les tikis imprimés avant qu'elle n'existe.
 */
export function resolveVariantByEAN(
  candidats: ModelData[],
  ean13: string,
  axesOf: AxesLookup = axesFromFiche,
): ScanHit | null {
  const key = String(ean13 || '').trim();
  if (!key) return null;
  for (const m of candidats) {
    const map = (m.meta_data as any)?.variantCodes;
    const hit = map && map[key];
    if (hit && typeof hit.taille === 'string' && typeof hit.couleur === 'string') {
      return { model: m, taille: hit.taille, couleur: hit.couleur };
    }
  }
  for (const m of candidats) {
    const { sizes, colors } = axesOf(m);
    const base = ean13FromDigits(String(m.id)).slice(0, 10);
    for (let si = 0; si < sizes.length; si++) {
      for (let ci = 0; ci < colors.length; ci++) {
        if (ean13Variant(base, si, ci) === key) {
          return { model: m, taille: sizes[si], couleur: colors[ci] || '' };
        }
      }
    }
  }
  return null;
}

/**
 * Le code EAN-13 d'une cellule. `null` quand la cellule n'est sur aucun des
 * deux axes : mieux vaut ne pas imprimer de code-barres que d'en imprimer un
 * qui pointe une AUTRE pièce — l'ancienne écriture repliait l'index manquant
 * sur 0, et toutes les cellules inconnues recevaient le code de la première.
 */
export function variantCode(model: ModelData, couleur: string, taille: string, axes: VariantAxes): string | null {
  const si = axes.sizes.indexOf(taille);
  const ci = axes.colors.indexOf(couleur);
  if (si < 0 || ci < 0) return null;
  /* La formule ne loge QU'UN chiffre par axe : au-delà de 10 tailles ou
   * 10 couleurs, deux cellules recevraient le même code-barres. Mieux vaut
   * pas de code du tout qu'un code qui désigne une autre pièce. */
  if (si > 9 || ci > 9) return null;
  return ean13Variant(ean13FromDigits(String(model.id)).slice(0, 10), si, ci);
}

/**
 * N'importe quel code lu → la variante visée. `taille`/`couleur` peuvent
 * revenir vides : le code désignait alors le modèle sans préciser la case.
 */
export function resolveScan(
  candidats: ModelData[],
  code: string,
  axesOf: AxesLookup = axesFromFiche,
): ScanHit | null {
  /* Un code ENREGISTRE fait foi avant toute analyse, quelle que soit sa forme.
   * Une piece achetee arrive avec le code de son fournisseur : EAN-8, Code-128,
   * une reference maison — rien qui ressemble a nos 13 chiffres. Le rattacher a
   * une case, c'est tout ce dont le comptoir a besoin ; exiger notre format
   * obligerait a re-etiqueter de la marchandise deja etiquetee. */
  const brut = String(code || '').trim();
  if (brut) {
    for (const m of candidats) {
      const map = (m.meta_data as any)?.variantCodes;
      const hit = map && map[brut];
      if (hit && typeof hit.taille === 'string' && typeof hit.couleur === 'string') {
        return { model: m, taille: hit.taille, couleur: hit.couleur };
      }
    }
  }
  const p = parseScanCode(code);
  if (!p?.ref) return null;
  let model: ModelData | undefined;
  let taille = p.taille;
  let couleur = p.couleur;
  if (!taille && !couleur && /^\d{13}$/.test(p.ref)) {
    const hit = resolveVariantByEAN(candidats, p.ref, axesOf);
    if (hit) { model = hit.model; taille = hit.taille; couleur = hit.couleur; }
  }
  if (!model) {
    model =
      candidats.find(m => norm(m.meta_data?.reference) === norm(p.ref)) ||
      candidats.find(m => norm(m.meta_data?.nom_modele) === norm(p.ref));
  }
  if (!model) return null;
  /* On confronte aux axes UNION, pas a la seule fiche : une piece entree sous
   * « m » alors que la fiche dit « 38 » doit rester reconnaissable, sinon le
   * tiki se lit comme un modele sans case et la vente s'arrete. */
  const { sizes, colors } = axesOf(model);
  const color = couleur ? colors.find(c => norm(c) === norm(couleur)) : undefined;
  const size = taille ? sizes.find(s => norm(s) === norm(taille)) : undefined;
  return { model, taille: size ?? '', couleur: color ?? '' };
}

/**
 * Le lecteur de code-barres est un clavier qui tape très vite. On distingue une
 * rafale d'un humain par l'écart entre deux touches, et le code n'est validé
 * qu'au terminateur (Entrée/Tab). Retourne le détacheur d'écouteur.
 */
export function attachScannerListener(onCode: (code: string) => void): () => void {
  let buf = '';
  let active = false;
  let last = 0;
  const onKey = (e: KeyboardEvent) => {
    const now = performance.now();
    const gap = now - last;
    last = now;
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (active && buf.length >= 3) {
        const code = buf;
        buf = ''; active = false;
        e.preventDefault();
        onCode(code);
      } else { buf = ''; active = false; }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) { buf = ''; active = false; return; }
    if (gap < 35) { active = true; buf += e.key; e.preventDefault(); }
    else { active = false; buf = e.key; }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
