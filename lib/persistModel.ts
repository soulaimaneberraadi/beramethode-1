import type { ModelData } from '../types';

const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

/**
 * Rendre durables les écritures de modèle faites hors de l'atelier d'ingénierie.
 *
 * Pourquoi ce détour existe : en mode Express, la bibliothèque est RELUE depuis
 * le serveur à chaque retour de focus sur la fenêtre (App.tsx → `fetchModels`).
 * Toute mutation faite uniquement dans l'état React (duplication, renommage,
 * import, changement de `workflowStatus` vers Planning / Coupe / Export) était
 * donc effacée dès que l'utilisateur changeait d'application et revenait — le
 * modèle « disparaissait » du Planning et du Suivi.
 *
 * En mode statique (Vercel) ou en invité, `localStorage` reste la source de
 * vérité : il n'y a rien à envoyer, on répond `true` sans appel réseau.
 */

const actif = (user?: unknown): boolean => !IS_STATIC && !!user;

/** Envoi brut. `POST /api/models` fait un UPSERT du modèle ENTIER. */
const envoyer = async (model: ModelData): Promise<boolean> => {
    const res = await fetch('/api/models', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(model),
    });
    return res.ok;
};

/**
 * Enregistre un modèle NOUVEAU (duplication, import) : rien à relire, il
 * n'existe pas encore côté serveur.
 *
 * `saveModel` refuse un modèle sans `id` (400) : sans cette vérification
 * l'échec était muet, et `fetchModels` effaçait le modèle au retour de focus —
 * le symptôme même que ce module corrige.
 */
export async function creerModeleSurServeur(model: ModelData, user?: unknown): Promise<boolean> {
    if (!model || !model.id) {
        console.error('[persistModel] modèle sans id : enregistrement impossible');
        return false;
    }
    if (!actif(user)) return true;
    try {
        return await envoyer(model);
    } catch (e) {
        console.error('[persistModel] création refusée', e);
        return false;
    }
}

/**
 * Écrit le statut de flux et/ou le nom d'un modèle EXISTANT.
 *
 * Passe par `PATCH /api/models/:id/champs`, qui ne réécrit QUE ces champs, dans
 * une seule transaction SQLite. L'alternative — relire la fiche entière, la
 * patcher, la renvoyer par `POST /api/models` — laissait une fenêtre entre la
 * lecture et l'écriture : la sauvegarde différée de l'atelier d'ingénierie (2 s)
 * qui tombait dedans était intégralement effacée.
 */
export async function patcherModeleSurServeur(
    modelId: string,
    champs: { workflowStatus?: string; nomModele?: string },
    user?: unknown,
): Promise<boolean> {
    if (!modelId) return false;
    if (!actif(user)) return true;
    try {
        const res = await fetch(`/api/models/${encodeURIComponent(modelId)}/champs`, {
            credentials: 'include',
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(champs),
        });
        if (!res.ok) console.error('[persistModel] patch refusé', res.status);
        return res.ok;
    } catch (e) {
        console.error('[persistModel] patch refusé', e);
        return false;
    }
}
