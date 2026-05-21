// Palette minimaliste — couleurs douces, contraste accessible sur fond clair.
const CLIENT_PALETTE = [
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
] as const;

/** Hash déterministe → couleur stable pour un même nom de client. */
export function getClientColor(clientName: string | undefined | null): string {
    const name = (clientName || '').trim();
    if (!name) return '#64748B'; // slate-500
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % CLIENT_PALETTE.length;
    return CLIENT_PALETTE[idx];
}

/** Variante claire (tinted background) pour les chips/badges. */
export function getClientColorSoft(clientName: string | undefined | null): string {
    return getClientColor(clientName) + '14'; // 8% alpha en hex
}
