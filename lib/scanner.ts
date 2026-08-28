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

const norm = (s?: string) => (s || '').trim().toUpperCase();

/**
 * EAN-13 « variante » → (modèle, taille, couleur).
 * D'abord la carte enregistrée à l'impression (`meta_data.variantCodes`), puis
 * un repli calculé pour les tikis imprimés avant qu'elle n'existe.
 */
export function resolveVariantByEAN(candidats: ModelData[], ean13: string): ScanHit | null {
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
    const fiche: any = m.ficheData || {};
    const sizes: string[] = fiche.sizes || [];
    const colors: Array<{ id: string; name: string }> = fiche.colors || [];
    const base = ean13FromDigits(String(m.id)).slice(0, 10);
    for (let si = 0; si < sizes.length; si++) {
      for (let ci = 0; ci < colors.length; ci++) {
        if (ean13Variant(base, si, ci) === key) {
          return { model: m, taille: sizes[si], couleur: colors[ci]?.name || '' };
        }
      }
    }
  }
  return null;
}

/**
 * N'importe quel code lu → la variante visée. `taille`/`couleur` peuvent
 * revenir vides : le code désignait alors le modèle sans préciser la case.
 */
export function resolveScan(candidats: ModelData[], code: string): ScanHit | null {
  const p = parseScanCode(code);
  if (!p?.ref) return null;
  let model: ModelData | undefined;
  let taille = p.taille;
  let couleur = p.couleur;
  if (!taille && !couleur && /^\d{13}$/.test(p.ref)) {
    const hit = resolveVariantByEAN(candidats, p.ref);
    if (hit) { model = hit.model; taille = hit.taille; couleur = hit.couleur; }
  }
  if (!model) {
    model =
      candidats.find(m => norm(m.meta_data?.reference) === norm(p.ref)) ||
      candidats.find(m => norm(m.meta_data?.nom_modele) === norm(p.ref));
  }
  if (!model) return null;
  const fiche: any = model.ficheData || {};
  const colors: Array<{ id: string; name: string }> = fiche.colors || [];
  const sizes: string[] = fiche.sizes || [];
  const color = couleur ? colors.find(c => norm(c.name) === norm(couleur)) : undefined;
  const size = taille ? sizes.find(s => norm(s) === norm(taille)) : undefined;
  return { model, taille: size ?? '', couleur: color?.name ?? '' };
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
