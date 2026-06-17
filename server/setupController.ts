import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, isCookieSecure } from './jwtConfig';
import db from './db';

/**
 * GET /api/setup/status
 * Retourne { initialized: boolean } — public, sans auth.
 * initialized = true ssi company_settings(id=1) existe ET setup_complete=1.
 */
export const getSetupStatus = (_req: Request, res: Response) => {
  try {
    const row = db
      .prepare('SELECT setup_complete FROM company_settings WHERE id = 1')
      .get() as { setup_complete: number } | undefined;

    const initialized = !!(row && row.setup_complete === 1);
    return res.json({ initialized });
  } catch (error) {
    console.error('[setup] getSetupStatus error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/setup/init
 * Corps attendu : { companyName, specialty, adminEmail, adminPassword, adminName }
 * - Guard : si setup_complete=1 déjà → 403
 * - Crée la ligne company_settings (id=1) + premier utilisateur admin
 * - Retourne JWT cookie + user (même pattern que login/register)
 */
export const initSetup = async (req: Request, res: Response) => {
  const { companyName, specialty, adminEmail, adminPassword, adminName } = req.body;

  if (!companyName || !adminEmail || !adminPassword) {
    return res.status(400).json({
      message: 'companyName, adminEmail et adminPassword sont requis',
    });
  }

  // Guard : setup déjà effectué
  const existing = db
    .prepare('SELECT setup_complete FROM company_settings WHERE id = 1')
    .get() as { setup_complete: number } | undefined;

  if (existing && existing.setup_complete === 1) {
    return res.status(403).json({ message: 'Setup déjà effectué' });
  }

  try {
    const normalizedEmail = String(adminEmail).trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const doSetup = db.transaction(() => {
      // Créer (ou remplacer) le premier utilisateur admin
      const userStmt = db.prepare(
        `INSERT OR IGNORE INTO users (email, password, name, role) VALUES (?, ?, ?, 'admin')`
      );
      const userInfo = userStmt.run(normalizedEmail, hashedPassword, adminName || '');

      // Récupérer l'id (en cas de IGNORE si email existait déjà)
      let userId = userInfo.lastInsertRowid as number;
      if (!userId) {
        const row = db
          .prepare('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?')
          .get(normalizedEmail) as { id: number } | undefined;
        if (!row) throw new Error('Impossible de créer ou trouver le compte admin');
        userId = row.id;
        // S'assurer que le rôle est bien admin
        db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(userId);
      }

      // Créer / mettre à jour company_settings (singleton id=1)
      db.prepare(
        `INSERT INTO company_settings (id, name, specialty, setup_complete)
         VALUES (1, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           specialty = excluded.specialty,
           setup_complete = 1`
      ).run(companyName, specialty || null);

      return userId;
    });

    const userId = doSetup();

    const token = jwt.sign(
      { id: userId, email: adminEmail.trim().toLowerCase(), role: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: isCookieSecure(),
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      user: {
        id: userId,
        email: adminEmail.trim().toLowerCase(),
        name: adminName || '',
        role: 'admin',
      },
    });
  } catch (error: any) {
    console.error('[setup] initSetup error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
