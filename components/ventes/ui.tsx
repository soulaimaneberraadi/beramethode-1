import React from 'react';
import { AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { teinteDe } from './articles';

/**
 * Le vocabulaire visuel des ecrans de vente : une seule carte, une seule
 * facon d'aligner un chiffre, une seule barre de repartition.
 *
 * Ces composants vivaient DANS le corps de leurs pages. Un composant defini
 * a l'interieur d'un autre change d'identite a chaque rendu : React ne le
 * reconnait plus, il le demonte et le remonte au lieu de le mettre a jour.
 * A chaque frappe dans un champ de recherche, toutes les cartes etaient donc
 * reconstruites — images rechargees, etat interne perdu. Sortis ici, ils
 * gardent leur identite, et ce qu'ils affichaient par fermeture passe
 * desormais par leurs proprietes.
 */

export const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

export const Carte: React.FC<{
    titre: string;
    droite?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}> = ({ titre, droite, children, className = '' }) => (
    <section className={`border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface overflow-hidden ${className}`}>
        <header className="h-9 px-3.5 flex items-center justify-between gap-2 border-b border-slate-100 dark:border-dk-border">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted truncate">{titre}</span>
            {droite}
        </header>
        {children}
    </section>
);

/** La photo du modele, reprise de sa fiche. A defaut, ses initiales : un
 *  carre vide ferait croire a une image qui ne charge pas. */
export const Vignette: React.FC<{ image: string | null; nom: string; taille?: string }> = ({ image, nom, taille = 'w-7 h-7' }) => (
    image
        ? <img src={image} alt="" className={`${taille} rounded-md object-cover border border-slate-200 dark:border-dk-border shrink-0`} />
        : (
            <span className={`${taille} rounded-md shrink-0 flex items-center justify-center bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-[9px] font-black text-slate-400 dark:text-dk-muted`}>
                {nom.slice(0, 2).toUpperCase()}
            </span>
        )
);

/** « Bleu Marine » et « Bleu Ciel » se ressemblent en texte et pas du tout
 *  en rayon : la pastille est teintee avec le meme dictionnaire que les
 *  factures, jamais un second. Sans correspondance, elle reste grise — mieux
 *  vaut ne rien dire que mentir sur la teinte. */
export const PastilleCouleur: React.FC<{ nom: string }> = ({ nom }) => {
    const hex = teinteDe(nom);
    return (
        <span
            title={nom}
            className="w-3.5 h-3.5 rounded-full shrink-0 border border-slate-300 dark:border-dk-border"
            style={{ background: hex || 'transparent' }}
        >
            {!hex && <span className="block w-full h-full rounded-full bg-slate-200 dark:bg-dk-elevated" />}
        </span>
    );
};

export const EtiquetteTaille: React.FC<{ taille: string }> = ({ taille }) => (
    <span className="min-w-[26px] h-5 px-1.5 shrink-0 inline-flex items-center justify-center rounded-md bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-[9px] font-black uppercase text-slate-500 dark:text-dk-muted">
        {taille}
    </span>
);

/** Une variation par rapport a la meme duree, juste avant. Une periode
 *  precedente vide ne produit AUCUN pourcentage : « +∞ % » n'informe
 *  personne, et un premier mois n'est pas une progression. */
export const Delta: React.FC<{ actuel: number; avant: number; titre: string }> = ({ actuel, avant, titre }) => {
    if (!avant) return null;
    const pct = ((actuel - avant) / avant) * 100;
    const monte = pct >= 0;
    return (
        <span
            title={`${titre} : ${nf(avant)}`}
            className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-black tabular-nums ${monte ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
        >
            {monte ? <ArrowUpRight className="w-3 h-3 shrink-0" /> : <ArrowDownRight className="w-3 h-3 shrink-0" />}
            {/* Deux decimales sur un ecart de 97 % ne changent aucune
                decision : elles cassent la ligne en deux, c'est tout. */}
            {Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : nf(Math.abs(pct))}&nbsp;%
        </span>
    );
};

export const Tuile: React.FC<{
    titre: string; valeur: string; icone: React.ReactNode;
    alerte?: boolean; delta?: React.ReactNode; onOuvrir?: () => void;
}> = ({ titre, valeur, icone, alerte = false, delta, onOuvrir }) => (
    <div
        onClick={onOuvrir}
        role={onOuvrir ? 'button' : undefined}
        tabIndex={onOuvrir ? 0 : undefined}
        onKeyDown={onOuvrir ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOuvrir(); } } : undefined}
        className={`border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface px-3.5 py-3 ${onOuvrir ? 'cursor-pointer transition-colors hover:border-slate-400 dark:hover:border-dk-muted' : ''}`}
    >
        <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted">
            {icone}<span className="truncate">{titre}</span>
        </span>
        {/* Le montant garde sa ligne : mis cote a cote, « 145 794,47 MAD » et
            son ecart se coupaient tous les deux en deux morceaux. */}
        <p className={`mt-1 text-[17px] font-black tabular-nums leading-tight whitespace-nowrap overflow-hidden text-ellipsis ${alerte ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-dk-text'}`}>
            {valeur}
        </p>
        {delta && <p className="mt-0.5 leading-none">{delta}</p>}
    </div>
);

export type LigneRepartition = {
    cle: string;
    /** Le libelle affiche quand la clef est un identifiant illisible. */
    titre?: string;
    ca: number;
    /** Le CHIFFRE AFFICHE, quand il differe du montant. */
    valeur?: number;
    /** Ce que mesure la BARRE. Une part se calcule sur une grandeur qui
     *  s'additionne : un chiffre d'affaires, un nombre de ventes — jamais une
     *  somme de moyennes, qui ne veut rien dire. */
    poids?: number;
    detail: string;
    vignette?: React.ReactNode;
    sansPrix?: boolean;
};

export type TextesRepartition = {
    rien: string;
    sansPrix: string;
    sansPrixCourt: string;
    majoriteNonRenseigne: string;
};

/** Une repartition : le libelle, la part, et une barre fine. La part en
 *  POURCENTAGE d'abord — « 142 297 MAD » ne dit pas si c'est beaucoup.
 *
 *  Chaque ligne peut ouvrir sa propre page : aucun chiffre affiche n'est un
 *  cul-de-sac. */
export const Repartition: React.FC<{
    titre: string;
    lignes: LigneRepartition[];
    unite?: string;
    textes: TextesRepartition;
    libelle: (v: string) => string;
    onOuvrir?: (l: LigneRepartition) => void;
}> = ({ titre, lignes, unite, textes, libelle, onOuvrir }) => {
    const valeurDe = (l: LigneRepartition) => (l.valeur == null ? l.ca : l.valeur);
    const poidsDe = (l: LigneRepartition) => (l.poids == null ? l.ca : l.poids);
    const total = lignes.reduce((a, l) => a + poidsDe(l), 0);
    return (
        <Carte titre={titre}>
            <div className="p-3.5 space-y-2.5">
                {lignes.length === 0 && <p className="text-[11px] text-slate-400 dark:text-dk-muted">{textes.rien}</p>}
                {lignes.map(l => {
                    const part = total > 0 ? (poidsDe(l) / total) * 100 : 0;
                    const flou = l.cle === 'NON_PRECISE' || l.cle === '—';
                    const Bloc: any = onOuvrir ? 'button' : 'div';
                    return (
                        <Bloc
                            key={l.cle}
                            {...(onOuvrir ? {
                                type: 'button',
                                onClick: () => onOuvrir(l),
                                className: 'w-full text-left rounded-lg -mx-1 px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-dk-elevated/50 active:scale-[0.995] transition',
                            } : {})}
                        >
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="flex items-center gap-2 min-w-0">
                                    {/* Reconnaitre a l'oeil : une photo, une pastille
                                        de couleur ou une taille se lisent plus vite
                                        qu'un nom. */}
                                    {l.vignette}
                                    <span className={`font-bold truncate ${flou ? 'text-slate-400 dark:text-dk-muted italic' : 'text-slate-700 dark:text-dk-text-soft'}`}>
                                        {l.titre || libelle(l.cle)}
                                    </span>
                                    {/* Des pieces sorties sans prix : ni erreur ni
                                        normalite, mais le chiffre d'affaires de cette
                                        ligne est faux tant qu'on ne l'a pas tranche. */}
                                    {l.sansPrix && (
                                        <span title={textes.sansPrix} className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/50">
                                            <AlertTriangle className="w-2.5 h-2.5" />{textes.sansPrixCourt}
                                        </span>
                                    )}
                                </span>
                                <span className="shrink-0 tabular-nums">
                                    <span className="font-black text-slate-800 dark:text-dk-text">{nf(part)} %</span>
                                    <span className="ml-1.5 text-[10px] text-slate-400 dark:text-dk-muted">
                                        {nf(valeurDe(l))}{unite ? ` ${unite}` : ''}
                                    </span>
                                </span>
                            </div>
                            <div className="h-1 rounded-full bg-slate-100 dark:bg-dk-elevated mt-1 overflow-hidden">
                                <div className={`h-full rounded-full ${flou ? 'bg-slate-300 dark:bg-dk-border' : 'bg-slate-800 dark:bg-dk-accent'}`} style={{ width: `${Math.max(1.5, part)}%` }} />
                            </div>
                            <span className="block mt-0.5 text-[10px] text-slate-400 dark:text-dk-muted">{l.detail}</span>
                        </Bloc>
                    );
                })}
                {/* Quand l'inconnu domine, la repartition ne decrit plus
                    l'activite : elle decrit un defaut de saisie. Le dire vaut
                    mieux que laisser lire un graphique faux. */}
                {(() => {
                    const flous = lignes.filter(l => l.cle === 'NON_PRECISE' || l.cle === '—');
                    const partFlou = total > 0 ? (flous.reduce((a, l) => a + poidsDe(l), 0) / total) * 100 : 0;
                    if (partFlou < 50) return null;
                    return (
                        <p className="flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/20 rounded-lg px-2.5 py-1.5">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                            {textes.majoriteNonRenseigne}
                        </p>
                    );
                })()}
            </div>
        </Carte>
    );
};

/** Le jour par jour, du plus recent au plus ancien : sur telephone il defile
 *  a l'interieur de son cadre, il ne pousse pas la page. */
export const TableauJours: React.FC<{
    colonnes: string[];
    lignes: Array<{ jour: string; cellules: string[]; alerte?: string }>;
    textes: { titre: string; jour: string; rien: string };
}> = ({ colonnes, lignes, textes }) => (
    <Carte titre={textes.titre}>
        <div className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums">
                <thead>
                    <tr className="text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted">
                        <th className="text-left font-black px-3.5 py-1.5">{textes.jour}</th>
                        {colonnes.map(c => <th key={c} className="text-right font-black px-3.5 py-1.5 whitespace-nowrap">{c}</th>)}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                    {lignes.length === 0 && (
                        <tr><td colSpan={colonnes.length + 1} className="px-3.5 py-4 text-center text-slate-400 dark:text-dk-muted">{textes.rien}</td></tr>
                    )}
                    {lignes.map(l => (
                        <tr key={l.jour} className={l.alerte ? 'bg-amber-50/60 dark:bg-amber-950/20' : undefined}>
                            <td className="px-3.5 py-1.5 font-bold text-slate-500 dark:text-dk-muted whitespace-nowrap">
                                {l.jour.slice(8, 10)}/{l.jour.slice(5, 7)}
                                {/* Un jour hors norme se signale : sans cela, il faut
                                    comparer les lignes une a une pour voir que la
                                    moyenne du mois vient de la. */}
                                {l.alerte && (
                                    <span title={l.alerte} className="ml-1.5 inline-flex align-middle text-amber-600 dark:text-amber-400">
                                        <AlertTriangle className="w-3 h-3" />
                                    </span>
                                )}
                            </td>
                            {l.cellules.map((v, i) => (
                                <td key={i} className={`px-3.5 py-1.5 text-right whitespace-nowrap ${i === 0 ? 'font-black text-slate-800 dark:text-dk-text' : 'text-slate-500 dark:text-dk-text-soft'}`}>{v}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </Carte>
);

/** La courbe multi-lignes.
 *
 *  Le viewBox est en pourcentage d'aire (100x100) et les traits gardent leur
 *  epaisseur reelle (`vector-effect`) : la meme courbe reste lisible sur un
 *  telephone de 360 px et sur un ecran de bureau, sans recalcul. Un seul jour
 *  n'a pas de segment a tracer : on pose un point, sinon la ligne serait
 *  invisible et l'ecran paraitrait vide alors qu'il y a bien une vente. */
export const Courbes: React.FC<{
    jours: string[];
    series: Array<{ cle: string; couleur: string; points: number[] }>;
    cumul: boolean;
    devise: string;
    libelle: (v: string) => string;
}> = ({ jours, series, cumul, devise, libelle }) => {
    const cumuler = (p: number[]) => { let a = 0; return p.map(v => (a += v)); };
    const traces = series.map(s => ({ ...s, valeurs: cumul ? cumuler(s.points) : s.points }));
    const max = Math.max(1, ...traces.flatMap(t => t.valeurs));
    const n = jours.length;
    const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
    const y = (v: number) => 100 - (v / max) * 92 - 4;
    return (
        <div className="relative">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-28 sm:h-40 overflow-visible">
                {[0, 25, 50, 75, 100].map(g => (
                    <line key={g} x1="0" x2="100" y1={y((max * g) / 100)} y2={y((max * g) / 100)}
                        className="stroke-slate-100 dark:stroke-dk-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                ))}
                {traces.map(t => (
                    <g key={t.cle}>
                        <polyline
                            points={t.valeurs.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                            fill="none" stroke={t.couleur} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                        {/* Les jours a vente sont marques : sur 90 jours, une
                            journee isolee se perd sinon dans la ligne plate. */}
                        {t.valeurs.map((v, i) => (v > 0 ? (
                            <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill={t.couleur} vectorEffect="non-scaling-stroke">
                                <title>{`${jours[i]} · ${libelle(t.cle)} · ${nf(v)} ${devise}`}</title>
                            </circle>
                        ) : null))}
                    </g>
                ))}
            </svg>
            {/* L'echelle : une courbe sans son maximum ne dit pas si le pic
                vaut 800 ou 80 000. */}
            <span className="absolute top-0 left-0 text-[9px] font-bold tabular-nums text-slate-300 dark:text-dk-muted pointer-events-none">
                {nf(max)} {devise}
            </span>
        </div>
    );
};

/** Un chiffre nomme, dans une grille : le titre au-dessus, la valeur en
 *  gras, et de quoi la nuancer en dessous. */
export const Chiffre: React.FC<{ titre: string; valeur: string; sous?: React.ReactNode }> = ({ titre, valeur, sous }) => (
    <div className="p-3">
        <p className="text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted truncate">{titre}</p>
        <p className="text-[15px] font-black tabular-nums text-slate-900 dark:text-dk-text mt-0.5">{valeur}</p>
        {sous && <p className="text-[10px] text-slate-400 dark:text-dk-muted mt-0.5">{sous}</p>}
    </div>
);
