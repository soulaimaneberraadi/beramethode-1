import React from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft } from 'lucide-react';

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
    barre?: React.ReactNode;
    children: React.ReactNode;
}> = ({ titre, valeur, sous, alerte, onFermer, barre, children, retour }) => {
    React.useEffect(() => {
        const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
        document.addEventListener('keydown', echap);
        const avant = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', echap); document.body.style.overflow = avant; };
    }, [onFermer]);

    return createPortal(
        <div className="fixed inset-0 z-[120] flex flex-col sm:p-6 bg-slate-900/50">
            <button
                type="button"
                aria-label="Fermer"
                onClick={onFermer}
                className="sm:hidden h-14 w-full shrink-0"
            />
            <div className="flex-1 min-h-0 flex flex-col rounded-t-2xl sm:rounded-2xl bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border shadow-2xl overflow-hidden">
                <header className="shrink-0 px-3.5 sm:px-5 py-3 bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border">
                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            onClick={onFermer}
                            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-elevated"
                        >
                            {retour ? <ArrowLeft className="w-4 h-4" /> : (<><ArrowLeft className="w-4 h-4 sm:hidden" /><X className="w-4 h-4 hidden sm:block" /></>)}
                        </button>
                        <div className="min-w-0 flex-1">
                            {retour && <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">&larr; {retour}</p>}
                            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted truncate">{titre}</h2>
                            {valeur && (
                                <p className={`text-[19px] sm:text-[22px] font-black tabular-nums leading-tight ${alerte ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-dk-text'}`}>
                                    {valeur}
                                </p>
                            )}
                            {sous && <p className="text-[11px] text-slate-500 dark:text-dk-muted">{sous}</p>}
                        </div>
                    </div>
                    {barre && <div className="mt-2.5">{barre}</div>}
                </header>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 sm:px-5 py-3 space-y-2.5">
                    {children}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default PanneauDetail;
