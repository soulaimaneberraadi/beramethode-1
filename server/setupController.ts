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
  const { companyName, specialty, adminEmail, adminPassword, adminName, accountType, profileMeta, logo } = req.body;

  if (!companyName || !adminEmail || !adminPassword) {
    return res.status(400).json({
      message: 'companyName, adminEmail et adminPassword sont requis',
    });
  }

  // Type de compte : 'societe' (défaut) | 'client' | 'personnel'.
  const normalizedType =
    accountType === 'client' || accountType === 'personnel' ? accountType : 'societe';
  // Méta spécifique au type (région client, spécialisation personnel) → JSON.
  let profileMetaJson: string | null = null;
  if (profileMeta && typeof profileMeta === 'object') {
    try { profileMetaJson = JSON.stringify(profileMeta); } catch { profileMetaJson = null; }
  }
  // Logo (base64 data URL) optionnel — stocké tel quel dans company_settings.logo.
  const logoValue = typeof logo === 'string' && logo.startsWith('data:image/') ? logo : null;

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
        `INSERT INTO company_settings (id, name, specialty, logo, account_type, profile_meta, setup_complete)
         VALUES (1, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           specialty = excluded.specialty,
           logo = excluded.logo,
           account_type = excluded.account_type,
           profile_meta = excluded.profile_meta,
           setup_complete = 1`
      ).run(companyName, specialty || null, logoValue, normalizedType, profileMetaJson);

      // Seed du rôle système « Patron » (level 0) + adhésion du patron à sa
      // propre société. Débloque le flux multi-membres : addMember exige un
      // role_id existant, or aucun rôle n'était créé à l'onboarding. Le patron
      // reste super (loadUserContext : userId === ownerId OU rôle is_system
      // level 0). Idempotent via ids déterministes (ré-exécution sûre).
      // Les utilisateurs solo existants (sans ligne company_members) gardent
      // le fallback solo — ce seed ne touche que les NOUVELLES installations.
      const patronRoleId = `role-patron-${userId}`;
      db.prepare(
        `INSERT OR IGNORE INTO company_roles (id, owner_id, name, level, parent_role_id, is_system)
         VALUES (?, ?, 'Patron', 0, NULL, 1)`
      ).run(patronRoleId, userId);
      db.prepare(
        `INSERT OR IGNORE INTO company_members (id, owner_id, user_id, role_id, status)
         VALUES (?, ?, ?, ?, 'active')`
      ).run(`member-${userId}`, userId, userId, patronRoleId);

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
