import React, { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';

/**
 * Coque commune de TOUTES les fenêtres du module Sous-traitance.
 *
 * POURQUOI : chaque fenêtre était écrite à la main, donc chacune se comportait
 * differemment sur téléphone — certaines centrées et coupées, d'autres sans
 * défilement. Le patron retenu est celui du Planning : sur téléphone une
 * feuille qui monte du bas (le pouce atteint les boutons, le contexte reste
 * visible derrière), sur ordinateur une fenêtre centrée.
 *
 * Le contenu n'est PAS touché : chaque appelant garde son corps tel quel.
 */

/* ------------------------------------------------------------------ */
/* Préférence « plein écran » partagée par tout le module               */
/* ------------------------------------------------------------------ */

/** POURQUOI un état hors composant : celui qui agrandit une fiche veut le même
 *  confort à la fenêtre suivante, y compris quand cette fenêtre vit dans un
 *  autre fichier (EntitySheet, ClientsPanel). Un contexte imposerait de câbler
 *  un provider dans chaque arbre ; un petit magasin externe suffit et se lit
 *  avec `useSyncExternalStore`, donc sans hook hors composant. */
let fullscreenPref = false;
const fullscreenListeners = new Set<() => void>();

function subscribeFullscreen(cb: () => void) {
    fullscreenListeners.add(cb);
    return () => { fullscreenListeners.delete(cb); };
}
function getFullscreenSnapshot() { return fullscreenPref; }

/** Préférence d'agrandissement, partagée et retenue le temps de la session. */
export function useSheetFullscreen(): [boolean, () => void] {
    const value = useSyncExternalStore(subscribeFullscreen, getFullscreenSnapshot, getFullscreenSnapshot);
    const toggle = React.useCallback(() => {
        fullscreenPref = !fullscreenPref;
        fullscreenListeners.forEach(fn => fn());
    }, []);
    return [value, toggle];
}

/* ------------------------------------------------------------------ */
/* Verrou de défilement du fond                                         */
/* ------------------------------------------------------------------ */

/** POURQUOI un compteur : plusieurs fenêtres peuvent être empilées (une
 *  confirmation par-dessus une fiche). Sans compteur, la fermeture de celle du
 *  dessus rendait le défilement à la page alors que la fiche restait ouverte. */
let scrollLocks = 0;

interface SheetModalProps {
    onClose: () => void;
    /** Titre de l'en-tête. Absent = pas de barre d'en-tête (petites confirmations). */
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Icône affichée avant le titre. */
    icon?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    /** Niveau d'empilement EXISTANT de la fenêtre : à conserver tel quel,
     *  certaines s'ouvrent volontairement par-dessus d'autres. */
    zClass?: string;
    /** Fourni uniquement pour les fenêtres à contenu dense (tableaux, grilles). */
    fullscreen?: boolean;
    onToggleFullscreen?: () => void;
    footer?: React.ReactNode;
    /** `true` : les enfants sont posés tels quels dans la colonne (l'appelant
     *  gère lui-même son défilement, typiquement un `<form>` déjà en `flex-1`). */
    bare?: boolean;
    bodyClassName?: string;
    /** Certaines fenêtres de saisie ne doivent pas se fermer par mégarde. */
    closeOnBackdrop?: boolean;
    /** Boutons additionnels dans l'en-tête, avant agrandir/fermer. */
    headerActions?: React.ReactNode;
    /** Fond personnalisé (aperçu d'image plein noir, par exemple). */
    backdropClassName?: string;
    /** Habillage du panneau. Sert à l'aperçu d'image, qui doit rester sombre :
     *  une photo de produit posée sur du blanc se juge mal. */
    panelClassName?: string;
    children: React.ReactNode;
}

/** POURQUOI aucune largeur en `vw` : le conteneur ajoute déjà `sm:p-4`, donc
 *  `96vw` débordait de l'écran et coupait le bouton Fermer et la dernière
 *  colonne des tableaux. `sm:max-w-none` se calcule DANS la zone déjà amputée
 *  du padding, et reste donc toujours visible en entier. */
const SIZE_CLS = {
    sm: 'sm:max-w-sm sm:h-auto sm:max-h-[88vh]',
    md: 'sm:max-w-md sm:h-auto sm:max-h-[88vh]',
    lg: 'sm:max-w-2xl sm:h-auto sm:max-h-[88vh]',
    xl: 'sm:max-w-3xl sm:h-auto sm:max-h-[90vh]',
} as const;

const FULLSCREEN_CLS = 'sm:max-w-none sm:h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-2rem)]';

export default function SheetModal({
    onClose,
    title,
    subtitle,
    icon,
    size = 'md',
    zClass = 'z-50',
    fullscreen,
    onToggleFullscreen,
    footer,
    bare = false,
    bodyClassName,
    closeOnBackdrop = true,
    headerActions,
    backdropClassName,
    panelClassName,
    children,
}: SheetModalProps) {
    const { lang } = useLang();

    // Échap suit la MÊME règle que le clic sur le fond : une fenêtre protégée
    // de la fermeture accidentelle parce qu'elle porte une saisie doit l'être
    // des deux côtés. Fermer au clavier ce qu'on refuse de fermer à la souris
    // perdrait la saisie sans un mot, et de la façon la plus surprenante.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && closeOnBackdrop) onClose(); };
        document.addEventListener('keydown', onKey);
        scrollLocks += 1;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            scrollLocks = Math.max(0, scrollLocks - 1);
            if (scrollLocks === 0) document.body.style.overflow = '';
        };
    }, [onClose, closeOnBackdrop]);

    if (typeof document === 'undefined') return null;

    const panelCls = [
        'relative w-full overflow-hidden flex flex-col rounded-t-2xl sm:rounded-2xl max-h-[92vh] sm:my-auto',
        panelClassName ?? 'bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border shadow-2xl dark:shadow-dk-elevated text-slate-700 dark:text-dk-text',
        fullscreen ? FULLSCREEN_CLS : SIZE_CLS[size],
    ].join(' ');

    const showHeader = Boolean(title) || Boolean(headerActions);

    return createPortal(
        <div
            className={`fixed inset-0 ${zClass} flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto ${backdropClassName ?? 'bg-slate-950/25 dark:bg-dk-bg/50 backdrop-blur-[2px]'}`}
            onClick={closeOnBackdrop ? onClose : undefined}
        >
            <div className={panelCls} onClick={(e) => e.stopPropagation()}>
                {/* Poignée : convention mobile, dit qu'on peut refermer en glissant. */}
                <div className="sm:hidden pt-2 pb-1 flex items-center justify-center shrink-0">
                    <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-dk-muted" />
                </div>

                {showHeader && (
                    <div className="flex items-center justify-between gap-2 px-5 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-surface/55 shrink-0">
                        <div className="min-w-0 flex items-center gap-2">
                            {icon}
                            <div className="min-w-0">
                                <h2 className="font-bold text-slate-800 dark:text-dk-text text-sm sm:text-base truncate">{title}</h2>
                                {subtitle && (
                                    <p className="text-[11px] text-slate-500 dark:text-dk-muted truncate mt-0.5">{subtitle}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            {headerActions}
                            {onToggleFullscreen && (
                                /* Caché sur téléphone : la feuille y occupe déjà tout l'espace utile. */
                                <button
                                    type="button"
                                    onClick={onToggleFullscreen}
                                    className="hidden sm:inline-flex p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft"
                                    title={fullscreen
                                        ? tx(lang, { fr: 'Réduire la fenêtre', ar: 'تصغير النافذة', en: 'Restore window', es: 'Restaurar ventana', pt: 'Restaurar janela', tr: 'Pencereyi küçült' })
                                        : tx(lang, { fr: 'Agrandir en plein écran', ar: 'تكبير لملء الشاشة', en: 'Expand to full screen', es: 'Ampliar a pantalla completa', pt: 'Expandir para ecrã inteiro', tr: 'Tam ekrana genişlet' })}
                                >
                                    {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft"
                                title={tx(lang, { fr: 'Fermer', ar: 'إغلاق', en: 'Close', es: 'Cerrar', pt: 'Fechar', tr: 'Kapat' })}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}

                {bare ? children : (
                    <div className={bodyClassName ?? 'flex-1 overflow-y-auto min-h-0 p-5 sm:p-6'}>{children}</div>
                )}

                {footer && (
                    <div className="shrink-0 px-5 sm:px-6 py-3 border-t border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/40 flex flex-wrap items-center justify-end gap-2">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
