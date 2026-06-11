import { Request, Response } from 'express';
import db from './db';

/**
 * Profil personnel de l'utilisateur (table user_profiles).
 * Données qui suivent la personne à vie, indépendamment de la société.
 */

const uid = (req: Request) => (req as any).user?.id as number;

/** GET /api/profile/me — profil + infos compte. */
export const getMyProfile = (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const account = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(userId) as any;
    const profile = db.prepare('SELECT phone, photo_base64, metier, bio, is_public FROM user_profiles WHERE user_id = ?').get(userId) as any;
    res.json({
      ok: true,
      account: account || null,
      profile: profile || { phone: '', photo_base64: '', metier: '', bio: '', is_public: 0 },
    });
  } catch (e) {
    console.error('getMyProfile error:', e);
    res.status(500).json({ ok: false, error: 'load failed' });
  }
};

/** PUT /api/profile/me — met à jour le profil personnel (UPSERT). */
export const updateMyProfile = (req: Request, res: Response) => {
  try {
    const userId = uid(req);
    const { phone, photo_base64, metier, bio, is_public, name } = req.body as {
      phone?: string; photo_base64?: string; metier?: string; bio?: string; is_public?: number; name?: string;
    };

    // Le nom vit sur le compte (users), modifiable par la personne elle-même.
    if (typeof name === 'string' && name.trim()) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), userId);
    }

    db.prepare(
      `INSERT INTO user_profiles (user_id, phone, photo_base64, metier, bio, is_public, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         phone = excluded.phone,
         photo_base64 = excluded.photo_base64,
         metier = excluded.metier,
         bio = excluded.bio,
         is_public = excluded.is_public,
         updated_at = CURRENT_TIMESTAMP`
    ).run(userId, phone ?? '', photo_base64 ?? '', metier ?? '', bio ?? '', is_public ? 1 : 0);

    res.json({ ok: true });
  } catch (e) {
    console.error('updateMyProfile error:', e);
    res.status(500).json({ ok: false, error: 'save failed' });
  }
};
