import type { ModelData } from '../types';

const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

/**
 * Écrit un modèle sur le serveur (`POST /api/models`).
 *
 * Pourquoi ce détour existe : en mode Express, la bibliothèque est RELUE depuis
 * le serveur à chaque retour de focus sur la fenêtre (App.tsx → `fetchModels`).
 * Toute mutation faite uniquement dans l'état React (duplication, renommage,
 * import, changement de `workflowStatus` vers Planning / Coupe / Export) était
 * donc effacée dès que l'utilisateur changeait d'application et revenait — le
 * modèle « disparaissait » du Planning et du Suivi. Cette fonction rend ces
 * écritures durables.
 *
 * En mode statique (Vercel) ou en invité, `localStorage` reste la source de
 * vérité : il n'y a rien à envoyer, on répond `true` sans appel réseau.
 */
export async function persistModelToServer(model: ModelData, user?: unknown): Promise<boolean> {
    if (IS_STATIC || !user) return true;
    try {
        const res = await fetch('/api/models', {
            credentials: 'include',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(model),
        });
        return res.ok;
    } catch (e) {
        console.error('persistModelToServer failed', e);
        return false;
    }
}
