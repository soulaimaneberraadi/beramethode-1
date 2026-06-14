// Couleurs déterministes par OF/Pedido pour le Suivi de Production.
// Chaque OF (planningId) reçoit une couleur stable et distincte, afin que deux
// modèles (ou deux Pedidos du même modèle) actifs le même jour ne se confondent pas.

// Palette partagée avec le Planning (couleurs douces, contraste accessible sur fond clair).
const OF_PALETTE = [
    '#2149C1', // bleu marque
    '#0EA5E9', // sky
    '#10B981', // emerald
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // violet
    '#EC4899', // pink
    '#14B8A6', // teal
    '#F97316', // orange
    '#6366F1', // indigo
    '#84CC16', // lime
    '#06B6D4', // cyan
] as const;

export interface OFStyle {
    /** Fond clair teinté (cellule, chip). */
    bg: string;
    /** Couleur pleine (bordure, point). */
    border: string;
    /** Texte foncé lisible. */
    text: string;
    /** Couleur pleine brute (hex). */
    base: string;
}

/** Hash déterministe d'une chaîne → index stable. */
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

/** Normalise un hex court (#abc) en long (#aabbcc). Renvoie null si invalide. */
function normalizeHex(hex: string | undefined | null): string | null {
    if (!hex) return null;
    let h = hex.trim();
    if (!h.startsWith('#')) h = '#' + h;
    if (/^#[0-9a-fA-F]{3}$/.test(h)) {
        h = '#' + h.slice(1).split('').map(c => c + c).join('');
    }
    return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toLowerCase() : null;
}

/** Dérive {bg, border, text} à partir d'une couleur pleine hex. */
export function hexToTints(hex: string): OFStyle {
    const base = normalizeHex(hex) || '#64748b';
    const r = parseInt(base.slice(1, 3), 16);
    const g = parseInt(base.slice(3, 5), 16);
    const b = parseInt(base.slice(5, 7), 16);

    // Fond clair = couleur sur blanc à ~14% d'opacité.
    const mix = (c: number) => Math.round(c * 0.14 + 255 * 0.86);
    const bg = `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;

    // Texte = version assombrie (~70%) pour rester lisible.
    const dark = (c: number) => Math.round(c * 0.7);
    const text = `rgb(${dark(r)}, ${dark(g)}, ${dark(b)})`;

    return { bg, border: base, text, base };
}

/**
 * Couleur d'un OF/Pedido pour le Suivi.
 * Priorité : override (couleur manuelle ou event.color du Planning) sinon
 * couleur déterministe dérivée de la clé (= planningId de l'OF).
 */
export function getOFColor(key: string, override?: string | null): OFStyle {
    const normalized = normalizeHex(override);
    if (normalized) return hexToTints(normalized);
    const base = OF_PALETTE[hashString(key || '') % OF_PALETTE.length];
    return hexToTints(base);
}

/** Palette exposée pour un picker rapide dans l'UI. */
export const OF_COLOR_CHOICES = OF_PALETTE;
