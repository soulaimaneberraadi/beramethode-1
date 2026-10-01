/**
 * Encours (WIP) par taille, lu dans la serie de coupe du modele.
 *
 * La page Suivi faisait saisir a la main des entrees/sorties par taille (S, M,
 * L, XL figes), alors que La Coupe tient deja la verite : chaque paquet de la
 * serie d'etiquetage (un matelas x une taille) porte sa date d'ENTREE en
 * chaine, sa chaine et sa date de SORTIE. On relit donc :
 *
 *   commande = la repartition couleur x taille du modele (fiche) ;
 *   coupe    = pieces des paquets dont le matelas est coupe (toutes chaines) ;
 *   entre    = pieces des paquets entres sur CETTE chaine ;
 *   sorti    = pieces des paquets sortis de CETTE chaine ;
 *   encours  = entre - sorti.
 *
 * Les pieces d'un paquet sont ses plis corriges par la colonne PIECES (-/+),
 * exactement comme `avancementSerie` (fiche d'un ordre au Planning).
 * Un paquet entre sans chaine notee n'est attribue a la chaine que si le
 * modele n'est planifie que sur elle ; sinon on le compte a part, sans deviner.
 *
 * Lancer les tests : node --import tsx lib/suiviCoupe.test.ts
 */
import type { ModelData } from '../types';
import { paquetsSerie, saisieDe } from './serieEtiquetage';
import { detailCouleurTaille } from './coupeVues';
import { cleChaine } from './effectifChaine';

export interface ChiffresWip { commande: number; coupe: number; entre: number; sorti: number; encours: number }
export interface LigneWip extends ChiffresWip { taille: string }

export interface WipCoupe {
    lignes: LigneWip[];
    total: ChiffresWip;
    /** Pieces entrees en chaine sans chaine notee, qu'on ne peut pas attribuer. */
    sansChaine: number;
    paquets: { total: number; coupes: number; entres: number; sortis: number };
}

const taillesDu = (m: ModelData): string[] => {
    const fiche: any = m.ficheData || {};
    const declarees: string[] = fiche.sizes || (m.meta_data as any)?.sizes || [];
    const out = [...declarees];
    // Une taille presente dans les traces mais absente de la fiche compte quand meme.
    for (const l of m.ordreCoupe?.matelasLines || []) {
        for (const [t, v] of Object.entries(l.ratios || {})) if (Number(v) > 0 && !out.includes(t)) out.push(t);
    }
    return out;
};

export function wipCoupe(m: ModelData | undefined, chaineId: string, chainesDuModele: string[]): WipCoupe | null {
    const lignes = m?.ordreCoupe?.matelasLines;
    if (!m || !lignes?.length) return null;
    const tailles = taillesDu(m);
    const serie = m.ordreCoupe?.serie;
    const paquets = paquetsSerie(lignes, tailles, serie?.depart || 1, serie?.figes);
    if (!paquets.length) return null;

    const cle = cleChaine(chaineId);
    const chaines = new Set(chainesDuModele.map(cleChaine).filter(Boolean));
    const seuleChaine = chaines.size === 1 && chaines.has(cle);

    const vide = (): ChiffresWip => ({ commande: 0, coupe: 0, entre: 0, sorti: 0, encours: 0 });
    const parTaille = new Map<string, ChiffresWip>(tailles.map(t => [t, vide()]));
    const w: WipCoupe = { lignes: [], total: vide(), sansChaine: 0, paquets: { total: 0, coupes: 0, entres: 0, sortis: 0 } };

    for (const d of detailCouleurTaille(m)) {
        const c = parTaille.get(d.taille);
        if (c) c.commande += d.commande;
    }

    for (const p of paquets) {
        const s = saisieDe(serie, p.cle);
        const n = Math.max(0, p.plis + (Number(s.pieces) || 0));
        const c = parTaille.get(p.taille) || vide();
        parTaille.set(p.taille, c);
        w.paquets.total++;
        if (p.fait) { c.coupe += n; w.paquets.coupes++; }

        // Un paquet sorti est forcement entre, meme si la date d'entree n'a pas ete notee.
        const entre = Boolean(s.entree || s.sortie);
        if (!entre) continue;
        const aLaChaine = s.chaine ? cleChaine(s.chaine) === cle : seuleChaine;
        if (!aLaChaine) {
            if (!s.chaine) w.sansChaine += n;
            continue;
        }
        c.entre += n; w.paquets.entres++;
        if (s.sortie) { c.sorti += n; w.paquets.sortis++; }
    }

    for (const [taille, c] of parTaille) {
        c.encours = c.entre - c.sorti;
        if (!c.commande && !c.coupe && !c.entre) continue;
        w.lignes.push({ taille, ...c });
        w.total.commande += c.commande;
        w.total.coupe += c.coupe;
        w.total.entre += c.entre;
        w.total.sorti += c.sorti;
    }
    w.total.encours = w.total.entre - w.total.sorti;
    return w;
}
