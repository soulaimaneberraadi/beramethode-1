import { Request, Response } from 'express';
import db from './db';
import { randomUUID } from 'crypto';

/**
 * Catalogue de temps — couche de CURATION uniquement.
 *
 * Le regroupement des opérations (clustering par similarité) est fait côté
 * interface, dans `components/CatalogueTemps.tsx`, à partir des gammes et des
 * relevés chrono : il est donc toujours à jour et n'a pas à être persisté.
 *
 * Ce contrôleur ne stocke que ce que le calcul ne peut PAS redériver, et qui
 * serait perdu à chaque rechargement :
 *   - `avg_time` / `min_time` / `max_time` : temps corrigés à la main
 *   - `confirmed` : temps validé par le méthodiste
 *   - `pinned`    : opération épinglée
 *   - `custom_notes`, `garment_type`, `operation_type`
 *
 * La clé de jointure est `norm_key` (description normalisée + machine
 * normalisée), calculée à l'identique des deux côtés : une entrée dérivée
 * retrouve ainsi sa curation même si son id change d'un rendu à l'autre.
 */

const norm = (s: string) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ');

const machineNorm = (raw: string) =>
    norm(raw)
        .replace(/\s*·\s*/g, '·')
        .replace(/\s*[-–—]\s*/g, '-')
        .replace(/\s{2,}/g, ' ');

/** Doit rester identique à `buildNormKey` côté interface. */
export function buildNormKey(description: string, machine: string): string {
    return `${norm(description)}|${machineNorm(machine)}`;
}

const parseJson = <T>(raw: unknown, fallback: T): T => {
    try { return JSON.parse(String(raw ?? '')) as T; } catch { return fallback; }
};

/** GET /api/catalog/entries — toutes les curations de la société. */
export const getCatalogEntries = (req: Request, res: Response) => {
    const ownerId = (req as any).companyId ?? (req as any).user.id;
    try {
        const rows = db.prepare(`
            SELECT * FROM time_catalog_entries
            WHERE owner_id = ?
            ORDER BY pinned DESC, updated_at DESC
        `).all(ownerId) as Record<string, unknown>[];

        res.json(rows.map(r => ({
            ...r,
            categories: parseJson(r.categories, [] as string[]),
            sources: parseJson(r.sources, [] as unknown[]),
            worker_names: parseJson(r.worker_names, [] as string[]),
        })));
    } catch (error) {
        console.error('[catalog] getCatalogEntries:', error);
        res.status(500).json({ message: 'Erreur lors du chargement du catalogue' });
    }
};

/**
 * PUT /api/catalog/curation — crée ou met à jour la curation d'une opération.
 *
 * Identifiée par `norm_key`, pas par un id : l'entrée dérivée côté interface
 * n'existe pas forcément encore en base la première fois qu'on la corrige.
 * Seuls les champs présents dans le corps sont modifiés.
 */
export const upsertCatalogCuration = (req: Request, res: Response) => {
    const ownerId = (req as any).companyId ?? (req as any).user.id;
    const {
        description, machine, section,
        avg_time, min_time, max_time,
        pinned, confirmed, custom_notes, garment_type, operation_type,
    } = req.body ?? {};

    if (!description || !machine) {
        return res.status(400).json({ message: '`description` et `machine` sont obligatoires' });
    }

    const normKey = buildNormKey(String(description), String(machine));

    try {
        const existing = db
            .prepare('SELECT id FROM time_catalog_entries WHERE owner_id = ? AND norm_key = ?')
            .get(ownerId, normKey) as { id: string } | undefined;

        if (!existing) {
            db.prepare(`
                INSERT INTO time_catalog_entries (
                    id, owner_id, norm_key, description, machine, section,
                    avg_time, min_time, max_time, count,
                    pinned, confirmed, custom_notes, garment_type, operation_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
            `).run(
                randomUUID(), ownerId, normKey, String(description), String(machine), section ?? null,
                Number(avg_time) || 0, Number(min_time) || 0, Number(max_time) || 0,
                pinned ? 1 : 0, confirmed ? 1 : 0,
                custom_notes ?? null, garment_type ?? null, operation_type ?? null,
            );
        } else {
            const sets: string[] = [];
            const values: unknown[] = [];
            const put = (col: string, val: unknown) => { sets.push(`${col} = ?`); values.push(val); };

            if (avg_time != null) put('avg_time', Number(avg_time));
            if (min_time != null) put('min_time', Number(min_time));
            if (max_time != null) put('max_time', Number(max_time));
            if (pinned != null) put('pinned', pinned ? 1 : 0);
            if (confirmed != null) put('confirmed', confirmed ? 1 : 0);
            if (custom_notes != null) put('custom_notes', custom_notes);
            if (garment_type != null) put('garment_type', garment_type);
            if (operation_type != null) put('operation_type', operation_type);
            if (section != null) put('section', section);

            if (sets.length === 0) {
                return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
            }

            sets.push('updated_at = CURRENT_TIMESTAMP');
            values.push(existing.id, ownerId);
            db.prepare(`UPDATE time_catalog_entries SET ${sets.join(', ')} WHERE id = ? AND owner_id = ?`)
                .run(...values);
        }

        const saved = db
            .prepare('SELECT * FROM time_catalog_entries WHERE owner_id = ? AND norm_key = ?')
            .get(ownerId, normKey);
        res.json(saved);
    } catch (error) {
        console.error('[catalog] upsertCatalogCuration:', error);
        res.status(500).json({ message: "Erreur lors de l'enregistrement" });
    }
};

/** DELETE /api/catalog/curation/:normKey — retire la curation, l'opération redevient purement calculée. */
export const deleteCatalogCuration = (req: Request, res: Response) => {
    const ownerId = (req as any).companyId ?? (req as any).user.id;
    try {
        const result = db
            .prepare('DELETE FROM time_catalog_entries WHERE owner_id = ? AND norm_key = ?')
            .run(ownerId, decodeURIComponent(req.params.normKey));

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Curation introuvable' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[catalog] deleteCatalogCuration:', error);
        res.status(500).json({ message: 'Erreur lors de la suppression' });
    }
};
