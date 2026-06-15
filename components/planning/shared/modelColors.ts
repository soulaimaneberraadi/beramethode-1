// Palette étendue pour les modèles — chaque modèle obtient une couleur unique.
const MODEL_PALETTE = [
    '#3B82F6', // blue-500
    '#10B981', // emerald-500
    '#F59E0B', // amber-500
    '#EF4444', // red-500
    '#8B5CF6', // violet-500
    '#EC4899', // pink-500
    '#14B8A6', // teal-500
    '#F97316', // orange-500
    '#6366F1', // indigo-500
    '#84CC16', // lime-500
    '#06B6D4', // cyan-500
    '#A855F7', // purple-500
    '#22C55E', // green-500
    '#EAB308', // yellow-500
    '#0EA5E9', // sky-500
    '#D946EF', // fuchsia-500
    '#F43F5E', // rose-500
    '#0891B2', // cyan-600
    '#7C3AED', // violet-600
    '#059669', // emerald-600
] as const;

/** Hash déterministe → couleur stable pour un même modèle. */
export function getModelColor(modelKey: string | undefined | null): string {
    const key = (modelKey || '').trim();
    if (!key) return '#64748B'; // slate-500
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % MODEL_PALETTE.length;
    return MODEL_PALETTE[idx];
}

/** Variante claire pour les fonds. */
export function getModelColorSoft(modelKey: string | undefined | null): string {
    return getModelColor(modelKey) + '1A'; // ~10% alpha
}

/** Variante plus sombre pour les bordures/texte. */
export function getModelColorStrong(modelKey: string | undefined | null): string {
    return getModelColor(modelKey);
}
