import React from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, ExternalLink } from 'lucide-react';

/**
 * La coquille commune aux pages de detail des tuiles.
 *
 * Elle passe par un portail sur `document.body` : une `position: fixed` posee
 * a l'interieur d'un parent anime (Framer Motion pose un `transform`) se
 * mesure par rapport a ce parent, pas a l'ecran — la page s'ouvrait alors
 * decalee sous l'en-tete.
 *
 * Sur telephone la feuille monte du bas et laisse une bande cliquable en
 * haut pour refermer ; sur grand ecran elle occupe l'ecran avec une marge.
 */
const PanneauDetail: React.FC<{
    titre: string;
    valeur?: string;
    sous?: string;
    alerte?: boolean;
    onFermer: () => void;
    /** Quand la feuille est empilee sur une autre : la fleche revient a la
     *  precedente au lieu de tout refermer, et on le dit. */
    retour?: string;
    /** Le titre devient un bouton : sur une feuille client, le nom mene a sa
     *  fiche complete. Sans cela, le nom etait un cul-de-sac affiche en gris. */
    onTitre?: () => void;
    titreInfo?: string;
    barre?: React.ReactNode;
    children: React.ReactNode;
}> = ({ titre, valeur, sous, alerte, onFermer, barre, children, retour, onTitre, titreInfo }) => {
    React.useEffect(() => {
        const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
        document.addEventListener('keydown', echap);
        const avant = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', echap); document.body.style.overflow = avant; };
    }, [onFermer]);

    /** Une feuille empilee ne doit PAS ressembler a celle du dessous : sans
     *  signe visible, on ne sait plus a quel etage on se trouve. L'en-tete
     *  sombre est ce signe — un seul coup d'oeil suffit. */
    const empile = !!retour;

    return createPortal(
        <div className="fixed inset-0 z-[120] flex flex-col sm:p-6 bg-slate-900/50">
            <button
                type="button"
                aria-label="Fermer"
                onClick={onFermer}
                className="sm:hidden h-14 w-full shrink-0"
            />
            <div className="flex-1 min-h-0 flex flex-col rounded-t-2xl sm:rounded-2xl bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border shadow-2xl overflow-hidden">
                <header className={`shrink-0 px-3.5 sm:px-5 pb-3 pt-1.5 sm:pt-3 border-b ${empile
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border'}`}>
                    {/* La barre de prehension : sur telephone elle dit que la
                        feuille est une feuille, et que le haut la referme. */}
                    <div className={`sm:hidden mx-auto mb-2 h-1 w-9 rounded-full ${empile ? 'bg-white/25' : 'bg-slate-300 dark:bg-dk-border'}`} />
                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            onClick={onFermer}
                            className={`w-9 h-9 sm:w-8 sm:h-8 -ml-1 sm:ml-0 shrink-0 rounded-lg flex items-center justify-center active:scale-95 transition ${empile
                                ? 'bg-white/10 text-white hover:bg-white/20'
                                : 'text-slate-400 hover:text-slate-900 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-elevated'}`}
                        >
                            {retour ? <ArrowLeft className="w-4 h-4" /> : (<><ArrowLeft className="w-4 h-4 sm:hidden" /><X className="w-4 h-4 hidden sm:block" /></>)}
                        </button>
                        <div className="min-w-0 flex-1">
                            {retour && (
                                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/45">
                                    &larr; {retour}
                                </p>
                            )}
                            {onTitre ? (
                                <button
                                    type="button"
                                    onClick={onTitre}
                                    title={titreInfo || titre}
                                    className={`max-w-full inline-flex items-center gap-1.5 py-0.5 hover:underline underline-offset-2 ${empile
                                        ? 'text-[17px] sm:text-[19px] font-black text-white decoration-white/40'
                                        : 'text-[11px] font-extrabold uppercase tracking-[0.08em] text-indigo-600 dark:text-indigo-400 decoration-indigo-300'}`}
                                >
                                    <span className="truncate">{titre}</span>
                                    <ExternalLink className={empile ? 'w-3.5 h-3.5 shrink-0 opacity-70' : 'w-3 h-3 shrink-0'} />
                                </button>
                            ) : (
                                <h2 className={empile
                                    ? 'text-[17px] sm:text-[19px] font-black text-white truncate'
                                    : 'text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted truncate'}>
                                    {titre}
                                </h2>
                            )}
                            {valeur && (
                                <p className={`font-black tabular-nums leading-tight ${empile
                                    ? `text-[15px] sm:text-[17px] ${alerte ? 'text-amber-300' : 'text-white/85'}`
                                    : `text-[19px] sm:text-[22px] ${alerte ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-dk-text'}`}`}>
                                    {valeur}
                                </p>
                            )}
                            {sous && <p className={`text-[11px] ${empile ? 'text-white/50' : 'text-slate-500 dark:text-dk-muted'}`}>{sous}</p>}
                        </div>
                    </div>
                    {barre && <div className="mt-2.5">{barre}</div>}
                </header>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 sm:px-5 py-3 space-y-2.5">
                    {children}
                    {/* Le retour au pied de page : sur telephone la feuille est
                        longue, et remonter jusqu'a la fleche du haut pour sortir
                        est un trajet inutile.
                        Uniquement quand il y a un ECRAN OU REVENIR : au premier
                        niveau, la pastille ne ferait que repeter la croix du
                        haut, en plus voyante qu'elle. */}
                    {retour && (
                    <div className="mt-2 flex justify-center pb-[env(safe-area-inset-bottom)]">
                        <button
                            type="button"
                            onClick={onFermer}
                            className="mx-auto inline-flex items-center gap-2 pl-2 pr-4 py-1.5 rounded-full bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted text-[12px] font-bold hover:bg-white dark:hover:bg-dk-elevated hover:text-slate-900 dark:hover:text-dk-text active:scale-[0.97] transition"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                            Retour
                        </button>
                    </div>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default PanneauDetail;
