/** Tokens de design — Minimalist SaaS (Linear/Notion/Stripe vibe).
 *  Inspirés d'un nuancier neutre + une seule couleur d'accent.
 */

export const SURFACE = {
    /** Toile principale */
    canvas: 'bg-white',
    /** Bandeau / barre */
    bar: 'bg-white',
    /** Zone subtilement teintée */
    muted: 'bg-slate-50/60',
    /** Hover discret */
    hover: 'hover:bg-slate-50',
} as const;

export const BORDER = {
    /** Bordure principale (très discrète) */
    base: 'border-slate-100',
    /** Bordure soulignée */
    strong: 'border-slate-200',
    /** Séparateur vertical */
    divider: 'bg-slate-100',
} as const;

export const TEXT = {
    /** Titre / chiffre important */
    primary: 'text-slate-900',
    /** Texte de corps */
    body: 'text-slate-700',
    /** Texte secondaire / label */
    muted: 'text-slate-500',
    /** Texte tertiaire / disabled */
    subtle: 'text-slate-400',
    /** Micro label (uppercase + tracking) */
    micro: 'text-[10px] font-medium text-slate-400 uppercase tracking-wider',
} as const;

export const ACCENT = {
    base: '#2149C1',
    text: 'text-[#2149C1]',
    bg: 'bg-[#2149C1]',
    bgHover: 'hover:bg-[#1a3ba5]',
    ring: 'ring-[#2149C1]',
    soft: 'bg-[#2149C1]/5',
    border: 'border-[#2149C1]/20',
} as const;

export const RADIUS = {
    sm: 'rounded-md',
    base: 'rounded-lg',
    lg: 'rounded-xl',
    full: 'rounded-full',
} as const;

export const SHADOW = {
    /** Ombre quasi-absente — élévation 1 */
    sm: 'shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
    /** Élévation 2 — panneau */
    base: 'shadow-[0_2px_8px_rgba(15,23,42,0.05)]',
    /** Élévation 3 — modal */
    lg: 'shadow-[0_8px_32px_rgba(15,23,42,0.10)]',
} as const;

export const TRANSITION = {
    base: 'transition-all duration-150',
    color: 'transition-colors duration-150',
} as const;
