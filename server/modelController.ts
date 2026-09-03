import { Request, Response } from 'express';
import db from './db';
import { recordTombstone } from './tombstones';

// Cloisonnement par workspace : on scope sur `companyId` (= owner_id du workspace
// actif, injecté par authenticateToken), avec repli sur user.id pour robustesse.
const ownerOf = (req: Request) => (req as any).companyId ?? (req as any).user.id;

export const getModels = (req: Request, res: Response) => {
  const ownerId = ownerOf(req);
  try {
    // Défensif : les modèles hérités (avant la colonne owner_id) ont owner_id NULL ;
    // ils appartiennent au workspace PRIMAIRE (owner_id === user_id). La condition
    // `owner_id IS NULL AND user_id = ?` ne matche QUE dans le primaire (companyId
    // === user_id), donc aucun modèle hérité ne fuit vers un workspace secondaire.
    const stmt = db.prepare(
      'SELECT data FROM models WHERE owner_id = ? OR (owner_id IS NULL AND user_id = ?) ORDER BY updated_at DESC'
    );
    const rows = stmt.all(ownerId, ownerId);
    const models = rows.flatMap((row: any) => {
      try { return [JSON.parse(row.data)]; } catch { return []; }
    });
    res.json(models);
  } catch (error) {
    console.error('Get models error:', error);
    res.status(500).json({ message: 'Error fetching models' });
  }
};

export const saveModel = (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const ownerId = ownerOf(req);
  const model = req.body;

  if (!model.id) {
    return res.status(400).json({ message: 'Model ID is required' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO models (id, user_id, owner_id, data, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      owner_id = excluded.owner_id,
      updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(model.id, userId, ownerId, JSON.stringify(model));
    res.json({ message: 'Model saved successfully' });
  } catch (error) {
    console.error('Save model error:', error);
    res.status(500).json({ message: 'Error saving model' });
  }
};

export const saveModelVariantCodes = (req: Request, res: Response) => {
  const ownerId = ownerOf(req);
  const { id } = req.params;
  const entrees: Array<{ code: string; taille: string; couleur: string }> = req.body?.entrees;

  if (!Array.isArray(entrees) || entrees.length === 0) {
    return res.status(400).json({ message: 'entrees is required' });
  }

  try {
    const row = db.prepare('SELECT data FROM models WHERE id = ? AND owner_id = ?').get(id, ownerId) as { data: string } | undefined;
    if (!row) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // On ne touche QUE meta_data.variantCodes : réécrire la fiche entière depuis
    // ce point d'entrée magasin effacerait le travail fait entre-temps côté
    // ingénierie sur les autres champs (gamme, chrono, coûts...).
    const model = JSON.parse(row.data);
    const prev = (model.meta_data as any)?.variantCodes || {};
    const next = { ...prev };
    let added = 0;
    entrees.forEach(e => {
      if (!e || !e.code) return;
      if (next[e.code]?.taille === e.taille && next[e.code]?.couleur === e.couleur) return;
      next[e.code] = { taille: e.taille, couleur: e.couleur };
      added++;
    });

    model.meta_data = { ...(model.meta_data || {}), variantCodes: next };
    model.updatedAt = new Date().toISOString();

    db.prepare('UPDATE models SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?')
      .run(JSON.stringify(model), id, ownerId);

    res.json({ added, model });
  } catch (error) {
    console.error('Save model variant codes error:', error);
    res.status(500).json({ message: 'Error saving variant codes' });
  }
};

export const deleteModel = (req: Request, res: Response) => {
  const ownerId = ownerOf(req);
  const { id } = req.params;

  try {
    const stmt = db.prepare('DELETE FROM models WHERE id = ? AND owner_id = ?');
    const info = stmt.run(id, ownerId);

    if (info.changes === 0) {
      return res.status(404).json({ message: 'Model not found' });
    }

    // La suppression doit voyager : le blob cloud garde encore ce modèle, et la
    // fusion du push (union, non destructive) le réinstallerait sans cette trace.
    recordTombstone('models', id, ownerId);

    res.json({ message: 'Model deleted successfully' });
  } catch (error) {
    console.error('Delete model error:', error);
    res.status(500).json({ message: 'Error deleting model' });
  }
};
