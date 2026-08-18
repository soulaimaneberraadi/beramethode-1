import db from './db';
import type { ModelData } from '../types';
import { DEFAULT_COMMERCIAL_SETTINGS } from '../types';
import { computeModelCostPrice, prixPlancher, estSousPlancher, SOUS_COUT_NOTE_PREFIX } from '../lib/costPrice';

/**
 * Politique commerciale côté SERVEUR.
 *
 * Le garde-fou « vente à perte » de l'écran est contournable : un appel direct à
 * `POST /api/subcontract/stock-sorties` l'ignore complètement. Or c'est
 * exactement ce qui rend un contrôle inutile en atelier — il suffit d'un script,
 * d'un ancien onglet ouvert ou d'une intégration tierce pour passer à côté.
 * Le serveur rejoue donc la même règle, avec la même formule de coût
 * (`lib/costPrice.ts`) et les mêmes réglages d'entreprise.
 *
 * ⚠️ Principe directeur : le serveur ne bloque JAMAIS sur une donnée qu'il ne
 * possède pas. Coût de revient incalculable → la sortie passe.
 */

/** Réglages globaux de l'entreprise tels que l'écran les enregistre :
 *  `POST /api/settings` avec la clé `global_settings` (App.tsx). */
const readGlobalSettings = (companyId: number | string): any => {
    try {
        const row = db
            .prepare("SELECT value FROM app_settings WHERE owner_id = ? AND key = 'global_settings'")
            .get(companyId) as { value?: string } | undefined;
        if (!row?.value) return {};
        const parsed = JSON.parse(row.value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        // Réglages illisibles : on retombe sur les défauts, jamais sur un refus.
        return {};
    }
};

export interface SousCoutVerdict {
    /** `true` quand la sortie doit être refusée (message à renvoyer en 400). */
    refuse: boolean;
    message?: string;
    /** Renseigné à titre informatif (journalisation, tests). */
    plancher?: number | null;
    policy: 'BLOCK' | 'CONFIRM' | 'ALLOW';
}

/**
 * Vérifie qu'une sortie de stock respecte la politique de vente sous le coût.
 *
 * @param lignes  lignes de la sortie, avec leur prix unitaire effectif
 * @param note    note de la sortie (elle doit porter le motif en 'CONFIRM')
 */
export const verifierVenteSousCout = (
    companyId: number | string,
    modelId: string,
    lignes: Array<{ prix_unitaire: number }>,
    note: string | null | undefined,
): SousCoutVerdict => {
    const settings = readGlobalSettings(companyId);
    const policy = (settings.venteSousCoutPolicy ?? DEFAULT_COMMERCIAL_SETTINGS.venteSousCoutPolicy) as
        'BLOCK' | 'CONFIRM' | 'ALLOW';
    const margeMinimale = Number(settings.margeMinimale ?? DEFAULT_COMMERCIAL_SETTINGS.margeMinimale);

    // 'ALLOW' : l'atelier a explicitement choisi de ne rien contrôler.
    if (policy === 'ALLOW') return { refuse: false, policy };

    // Le modèle est la seule source du coût. Absent (modèle supprimé, données
    // antérieures) → rien à comparer, donc rien à refuser.
    let model: ModelData | null = null;
    try {
        const row = db.prepare('SELECT data FROM models WHERE id = ? AND user_id = ?')
            .get(modelId, companyId) as { data?: string } | undefined;
        model = row?.data ? (JSON.parse(row.data) as ModelData) : null;
    } catch {
        model = null;
    }
    if (!model) return { refuse: false, policy };

    const cout = computeModelCostPrice(model, settings);
    const plancher = prixPlancher(cout, margeMinimale);
    // Modèle sans gamme chiffrée ni prix de sous-traitance : aucun garde-fou
    // possible. On laisse passer plutôt que d'inventer un coût.
    if (plancher == null) return { refuse: false, policy, plancher: null };

    // Les lignes à prix nul (dons, échantillons, régularisations) ne sont pas des
    // ventes à perte — `prixController` les exclut déjà de toutes les moyennes.
    const fautive = lignes.find(l => estSousPlancher(Number(l.prix_unitaire) || 0, plancher));
    if (!fautive) return { refuse: false, policy, plancher };

    const plancherTxt = plancher.toFixed(2);
    const prixTxt = (Number(fautive.prix_unitaire) || 0).toFixed(2);

    if (policy === 'BLOCK') {
        return {
            refuse: true,
            policy,
            plancher,
            message: `Vente sous le prix plancher refusée : ${prixTxt} saisi pour un plancher de ${plancherTxt} (prix de revient + ${margeMinimale} % de marge minimale). Politique de l'entreprise : vente à perte bloquée.`,
        };
    }

    // 'CONFIRM' : la vente est possible, mais elle doit être MOTIVÉE — c'est le
    // motif, pas le clic, qui rend la dérogation retrouvable plus tard.
    const motif = String(note ?? '');
    const idx = motif.indexOf(SOUS_COUT_NOTE_PREFIX);
    const corps = idx === -1 ? '' : motif.slice(idx + SOUS_COUT_NOTE_PREFIX.length).trim();
    if (!corps) {
        return {
            refuse: true,
            policy,
            plancher,
            message: `Vente sous le prix plancher (${prixTxt} pour un plancher de ${plancherTxt}) : un motif est obligatoire. Renseignez-le dans la note de la sortie, préfixé par « ${SOUS_COUT_NOTE_PREFIX} ».`,
        };
    }

    return { refuse: false, policy, plancher };
};
