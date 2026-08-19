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
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
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
    // Pour les fenetres a deux volets (reglages + apercu) : sous 1200 px, les
    // deux colonnes se marchent dessus et l'apercu ne montre plus rien d'utile.
    '2xl': 'sm:max-w-[1200px] sm:h-auto sm:max-h-[92vh]',
} as const;

/** Plein écran = la page entière, bord à bord. */
const FULLSCREEN_CLS = 'sm:max-w-none sm:rounded-none sm:h-screen sm:max-h-screen sm:my-0';

/** POURQUOI relever le niveau en plein écran : la barre de navigation du haut
 *  est en `z-[100]`, et plusieurs fenêtres vivaient sous ce niveau. Agrandies,
 *  elles passaient DERRIÈRE la barre et leur titre disparaissait. `z-[150]`
 *  passe devant la barre tout en restant sous les fenêtres qui s'ouvrent
 *  par-dessus (z-200 et plus), donc l'empilement existant est préservé. */
const Z_FULLSCREEN = 'z-[150]';

/** Distance de glissement au-delà de laquelle la feuille se referme. */
const SEUIL_FERMETURE = 110;

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

    /** Glissement de la poignée. `active` distingue le doigt posé (la feuille
     *  suit sans transition) du relâchement (retour animé). */
    const [drag, setDrag] = React.useState({ y: 0, active: false });
    const departY = React.useRef(0);

    const onGripDown = React.useCallback((e: React.PointerEvent) => {
        departY.current = e.clientY;
        setDrag({ y: 0, active: true });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    const onGripMove = React.useCallback((e: React.PointerEvent) => {
        setDrag(prev => {
            if (!prev.active) return prev;
            // Vers le haut : rien. Une feuille ne monte pas au-delà de sa place.
            return { y: Math.max(0, e.clientY - departY.current), active: true };
        });
    }, []);

    const onGripUp = React.useCallback((e: React.PointerEvent) => {
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
        setDrag(prev => {
            if (prev.y > SEUIL_FERMETURE) { onClose(); return { y: 0, active: false }; }
            return { y: 0, active: false };
        });
    }, [onClose]);

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
        'relative w-full overflow-hidden flex flex-col rounded-t-2xl max-h-[92vh]',
        panelClassName ?? 'bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border shadow-2xl dark:shadow-dk-elevated text-slate-700 dark:text-dk-text',
        // En plein écran, la feuille devient la page : bord à bord, sans coins
        // arrondis ni marge. Sinon on agrandit une fenêtre qui reste une fenêtre.
        fullscreen ? FULLSCREEN_CLS : `sm:rounded-2xl sm:my-auto ${SIZE_CLS[size]}`,
    ].join(' ');

    const showHeader = Boolean(title) || Boolean(headerActions);

    return createPortal(
        <div
            className={`fixed inset-0 ${fullscreen ? Z_FULLSCREEN : zClass} flex items-end sm:items-center justify-center p-0 overflow-y-auto ${fullscreen ? '' : 'sm:p-4'} ${backdropClassName ?? 'bg-slate-950/25 dark:bg-dk-bg/50 backdrop-blur-[2px]'}`}
            onClick={closeOnBackdrop ? onClose : undefined}
        >
            <div
                className={panelCls}
                onClick={(e) => e.stopPropagation()}
                style={drag.y > 0 ? { transform: `translateY(${drag.y}px)`, transition: drag.active ? 'none' : 'transform 200ms ease-out' } : undefined}
            >
                {/* Poignée : sur téléphone elle se SAISIT réellement — glisser vers
                    le bas fait suivre la feuille et la referme au-delà du seuil.
                    Un trait décoratif qui ne répond pas au doigt promet un geste
                    que l'écran ne tient pas. */}
                <div
                    className="sm:hidden pt-2 pb-2 flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing touch-none"
                    onPointerDown={onGripDown}
                    onPointerMove={onGripMove}
                    onPointerUp={onGripUp}
                    onPointerCancel={onGripUp}
                >
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

                {/* `overscroll-contain` + inertie iOS : sans eux, arriver en bout
                    de liste transmet le geste au fond, la page derrière bouge et
                    le défilement paraît accrocher. */}
                {bare ? children : (
                    <div
                        className={`${bodyClassName ?? 'flex-1 overflow-y-auto min-h-0 p-5 sm:p-6'} overscroll-contain`}
                        style={{ WebkitOverflowScrolling: 'touch' }}
                    >{children}</div>
                )}

                {footer && (
                    /* Toujours visible : les actions ne doivent jamais partir
                       hors de vue avec le défilement du contenu. */
                    <div className="shrink-0 px-5 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 border-t border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/40 flex flex-wrap items-center justify-end gap-2">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
