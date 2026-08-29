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
/**
 * La pastille de couleur : « Bleu Marine » et « Bleu Ciel » se ressemblent en
 * texte et pas du tout en rayon. On teinte donc le nom.
 *
 * On lit le nom de droite a gauche : dans « Vert Emeraude », c'est
 * « emeraude » qui tranche, pas « vert ». Faute de correspondance, la pastille
 * reste grise plutot que de mentir sur la teinte.
 */
const TEINTES: Record<string, string> = {
    blanc: '#ffffff', creme: '#f5efe0', ecru: '#efe6d5', beige: '#e3d3b8', sable: '#dfcaa5',
    noir: '#111827', anthracite: '#2f3437', gris: '#9ca3af', argent: '#c9ccd1', taupe: '#8d8177',
    rouge: '#dc2626', bordeaux: '#7a1128', grenat: '#8b1a3a', corail: '#f76f61', brique: '#b4442e',
    rose: '#f9a8d4', fuchsia: '#d9268b', magenta: '#c026d3', saumon: '#fa8c74',
    orange: '#f97316', abricot: '#f4a259', ocre: '#c98b21', moutarde: '#d9a300',
    jaune: '#facc15', dore: '#d4a017', or: '#d4a017', citron: '#e8e337',
    vert: '#16a34a', emeraude: '#0f9d76', olive: '#7d8a3a', kaki: '#7a7d47', menthe: '#8fd8bb', pistache: '#a7c957', sapin: '#14532d',
    bleu: '#2563eb', marine: '#1a2b57', ciel: '#7cc0f0', turquoise: '#1fb6c1', petrole: '#17545e', indigo: '#4338ca', denim: '#3a5f8a',
    violet: '#7c3aed', mauve: '#a78bce', lilas: '#c3aee0', prune: '#6b2a4f', lavande: '#b3a3e0',
    marron: '#6b4423', chocolat: '#4b2e1e', camel: '#c19a6b', cognac: '#9a5b2c',
    multicolore: '#94a3b8', imprime: '#94a3b8',
};

const sansAccent = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const teinteDe = (nom: string): string | null => {
    const mots = sansAccent(nom).split(/[\s/_-]+/).filter(Boolean);
    for (let i = mots.length - 1; i >= 0; i--) {
        if (TEINTES[mots[i]]) return TEINTES[mots[i]];
    }
    return null;
};

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
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] leading-[1.35] text-slate-400 dark:text-dk-muted">
                {g.variantes.map(v => {
                    const teinte = teinteDe(v.couleur);
                    return (
                        <span key={v.couleur} className="inline-flex items-center gap-1 whitespace-nowrap">
                            <span
                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/15 dark:border-white/25"
                                style={teinte ? { background: teinte } : undefined}
                                title={v.couleur}
                            />
                            <span className="font-bold text-slate-600 dark:text-dk-text-soft">{v.couleur}</span>
                            {/* Les parentheses separent les tailles : « 36×3 40×7 »
                                se lisait comme un seul nombre. */}
                            {v.tailles.map(t => (
                                <span key={t.taille} className="tabular-nums">({t.taille}×{nf(t.quantite)})</span>
                            ))}
                        </span>
                    );
                })}
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
