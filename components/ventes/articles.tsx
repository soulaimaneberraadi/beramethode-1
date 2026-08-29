import React from 'react';
import type { Article } from './FicheClientEncours';

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/**
 * Une facture de dix lignes, c'est dix lignes du MEME vetement decline en
 * couleurs et en tailles. Les empiler fait defiler l'ecran pour dire une
 * seule chose : « ce modele, 20 pieces ».
 *
 * On regroupe donc par modele, puis par couleur, et les tailles se lisent en
 * une ligne serree — la ou l'oeil les compare vraiment.
 */
export type Variante = { couleur: string; tailles: Array<{ taille: string; quantite: number }>; quantite: number };
export type GroupeModele = {
    cle: string; nom: string; image: string | null;
    quantite: number; total: number;
    prix: number[]; // les prix unitaires rencontres : un seul dans 99 % des cas
    variantes: Variante[];
};

export const grouperArticles = (articles: Article[]): GroupeModele[] => {
    const parModele = new Map<string, GroupeModele>();

    for (const a of articles) {
        const [nomBrut, ...reste] = a.designation.split(' — ');
        const variante = reste.join(' — ');
        const [couleurBrute, tailleBrute] = variante.split(' / ');
        const cle = a.modelId || nomBrut;

        if (!parModele.has(cle)) {
            parModele.set(cle, { cle, nom: nomBrut, image: a.image, quantite: 0, total: 0, prix: [], variantes: [] });
        }
        const g = parModele.get(cle)!;
        g.quantite += a.quantite;
        g.total += a.total;
        if (!g.image && a.image) g.image = a.image;
        if (a.prixUnitaire && !g.prix.includes(a.prixUnitaire)) g.prix.push(a.prixUnitaire);

        // Une remise ou une ligne libre n'a ni couleur ni taille : elle reste
        // seule, sans variante, plutot que d'inventer un « — / — ».
        if (!variante) continue;

        const couleur = (couleurBrute || '—').trim();
        const taille = (tailleBrute || '—').trim();
        let v = g.variantes.find(x => x.couleur === couleur);
        if (!v) { v = { couleur, tailles: [], quantite: 0 }; g.variantes.push(v); }
        v.quantite += a.quantite;
        const t = v.tailles.find(x => x.taille === taille);
        if (t) t.quantite += a.quantite;
        else v.tailles.push({ taille, quantite: a.quantite });
    }

    return [...parModele.values()];
};

/** Le bloc compact : photo, nom, couleurs et tailles serrees, montant a droite. */
export const LigneModele: React.FC<{ g: GroupeModele; devise: string; compact?: boolean }> = ({ g, devise, compact }) => (
    <div className="flex items-center gap-2.5 min-w-0">
        {g.image
            ? <img src={g.image} alt="" className={`${compact ? 'w-9 h-9' : 'w-11 h-11'} rounded-lg object-cover shrink-0 border border-slate-200 dark:border-dk-border`} />
            : <span className={`${compact ? 'w-9 h-9' : 'w-11 h-11'} rounded-lg bg-slate-100 dark:bg-dk-elevated shrink-0 flex items-center justify-center text-[9px] font-black text-slate-300`}>
                {g.nom.slice(0, 2).toUpperCase()}
            </span>}

        <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-black text-slate-800 dark:text-dk-text truncate">{g.nom}</span>
                <span className="text-[10px] font-black tabular-nums text-slate-400 shrink-0">×{nf(g.quantite)}</span>
            </span>
            <span className="block text-[9px] leading-[1.35] text-slate-400 dark:text-dk-muted">
                {g.variantes.map((v, i) => (
                    <span key={v.couleur} className="whitespace-nowrap">
                        {i > 0 && <span className="mx-1 text-slate-300">·</span>}
                        <span className="font-bold text-slate-500 dark:text-dk-text-soft">{v.couleur}</span>
                        {' '}
                        {v.tailles.map(t => `${t.taille}×${nf(t.quantite)}`).join(' ')}
                    </span>
                ))}
            </span>
        </span>

        <span className="shrink-0 text-right">
            <span className="block text-[12px] font-black tabular-nums text-slate-700 dark:text-dk-text">{nf(g.total)}</span>
            <span className="block text-[9px] tabular-nums text-slate-400 dark:text-dk-muted">
                {g.prix.length === 1 ? `${nf(g.prix[0])} ${devise}` : `${g.prix.length} prix`}
            </span>
        </span>
    </div>
);
