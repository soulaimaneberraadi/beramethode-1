import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, randomInt } from 'crypto';
import { JWT_SECRET, isCookieSecure, cookieSameSite, SESSION_MS, SESSION_EXPIRES_IN } from './jwtConfig';
import db from './db';
import nodemailer from 'nodemailer';
import { logAudit } from './auditLogger';
import { initUserSync } from './supabaseSync';

/** Avoid login/register failures from autofill spaces or Gmail-style case differences. */
function normalizeEmail(raw: string): string {
  return String(raw ?? '').trim().toLowerCase();
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://utrojjhscyatppgcszrt.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cm9qamhzY3lhdHBwZ2NzenJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjUwNDEsImV4cCI6MjA5NzIwMTA0MX0.Nu6MQJe6YTN-TH7kBLHqStaFSrvXpuGuzr6wp28XFlk';

/**
 * Depose le cookie de session.
 *
 * `seSouvenir` vient de la case « Se souvenir de moi » :
 *
 *   cochee    la session dure SESSION_DAYS (30 jours par defaut). L appareil
 *             est a la personne — son telephone, son poste — et lui redemander
 *             son mot de passe chaque matin ne protege rien : ca produit un
 *             mot de passe simple, ou note sur un papier.
 *
 *   decochee  cookie de session : il disparait a la fermeture du navigateur.
 *             C est le cas du poste partage de l atelier, ou du telephone d un
 *             collegue. Ne rien ecrire sur le disque est ici la bonne reponse.
 *
 * En cas de doute on ne se souvient pas : une session qui traine sur une
 * machine partagee est pire qu une reconnexion de trop.
 */
function setAuthCookie(
  res: Response,
  user: { id: number; email: string; role: string },
  seSouvenir = false,
): void {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    // Le jeton porte toujours la duree longue : c est le cookie qui decide de
    // sa survie. Un jeton court-circuiterait le rafraichissement glissant.
    { expiresIn: SESSION_EXPIRES_IN },
  );
  res.cookie('token', token, {
    httpOnly: true,
    secure: isCookieSecure(),
    sameSite: cookieSameSite(),
    // Sans maxAge, le navigateur en fait un cookie de session : efface a la
    // fermeture. C est exactement ce qu on veut quand la case est decochee.
    ...(seSouvenir ? { maxAge: SESSION_MS } : {}),
  });
}

function localRoleForNewUser(email: string): 'user' | 'admin' {
  if (email === 'soulaimaneberraadi@gmail.com') return 'admin';
  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users WHERE email != ?').get('guest@local') as { cnt: number }).cnt;
  return userCount === 0 ? 'admin' : 'user';
}

// Configure Nodemailer Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.yourdomain.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'no-reply@yourdomain.com',
    pass: process.env.SMTP_PASS || 'your_password_here',
  },
});

/**
 * Le serveur d'e-mail est-il reellement configure ?
 *
 * Les valeurs d'exemple livrees avec le projet (`mail.yourdomain.com`,
 * `your_password_here`) forment une configuration qui a l'air complete et qui
 * n'envoie rien. C'est le pire cas : l'utilisateur lit « code envoye », attend
 * un e-mail qui n'arrivera jamais, et reste dehors sans savoir pourquoi.
 *
 * Mieux vaut lui dire tout de suite que la recuperation par e-mail n'est pas
 * disponible ici, et qu'il doit passer par son administrateur.
 */
export const emailConfigure = (): boolean => {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  if (!host || !user || !pass) return false;
  const exemples = ['mail.yourdomain.com', 'no-reply@yourdomain.com', 'your_password_here', 'your_password'];
  return !exemples.includes(host) && !exemples.includes(user) && !exemples.includes(pass);
};

export const register = async (req: Request, res: Response) => {
  const { password, name } = req.body;
  const email = normalizeEmail(req.body.email);

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    let cloudUserId: string | undefined;
    // Premier utilisateur (hors guest@local) → rôle admin automatique
    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users WHERE email != ?').get('guest@local') as { cnt: number }).cnt;
    const role = userCount === 0 ? 'admin' : 'user';
    const stmt = db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)');
    const info = stmt.run(email, hashedPassword, name || '', role);

    setAuthCookie(res, { id: Number(info.lastInsertRowid), email, role });

    // Mettre en place le compte Supabase lors de l'enregistrement local.
    // On utilise les constantes du module (haut du fichier), qui portent les
    // mêmes valeurs par défaut que le reste du projet. Deux copies locales
    // déclarées ici retombaient sur '' faute de variable d'environnement, et
    // masquaient les bonnes : la condition ci-dessous était donc TOUJOURS
    // fausse sur une installation ordinaire, et le poste ne se liait jamais au
    // cloud. Voir le commentaire de `login` pour ce que cela coûtait.
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const sbRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email,
            password,
            options: { data: { name: name || '' } }
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (sbRes.ok) {
          const sbData = await sbRes.json() as { refresh_token?: string; user?: { id: string } };
          if (sbData.refresh_token && sbData.user) {
            db.prepare(`
              INSERT INTO supabase_sessions (user_id, supabase_user_id, refresh_token)
              VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                supabase_user_id = excluded.supabase_user_id,
                refresh_token = excluded.refresh_token,
                updated_at = CURRENT_TIMESTAMP
            `).run(info.lastInsertRowid, sbData.user.id, sbData.refresh_token);
            cloudUserId = sbData.user.id;
            void initUserSync(Number(info.lastInsertRowid), sbData.user.id, email, sbData.refresh_token);
          }
        }
      } catch (err) {
        console.warn(`[authController] Could not register Supabase account for user ${email}:`, err);
      }
    }

    res.status(201).json({ user: { id: info.lastInsertRowid, email, name, role, cloudUserId } });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: 'Email already exists' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  const seSouvenir = req.body.remember === true;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(TRIM(email)) = ?');
    const user = stmt.get(email) as any;

    if (!user || !(await bcrypt.compare(password, user.password))) {
      logAudit({ action: 'LOGIN_FAILED', detail: email, ip: req.ip });
      return res.status(401).json({ message: 'E-mail ou mot de passe incorrect.' });
    }

    logAudit({ userId: user.id, action: 'LOGIN', ip: req.ip });
    setAuthCookie(res, { id: user.id, email: user.email, role: user.role }, seSouvenir);

    // Identité cloud DÉJÀ connue pour ce compte. Elle sert de socle : le
    // navigateur s'en sert pour nommer ses clés localStorage (pkey). Si on la
    // laissait dépendre du seul aller-retour Supabase ci-dessous — 4 s de
    // délai, et Supabase peut être lent, hors service (522) ou limiter le
    // débit (429) — une panne passagère renverrait `undefined`, le navigateur
    // retomberait sur l'identifiant numérique, et TOUTES les données du compte
    // basculeraient dans un second espace de noms : le travail du jour devient
    // invisible et d'anciennes données réapparaissent à sa place.
    let cloudUserId: string | undefined = (() => {
      try {
        const row = db
          .prepare('SELECT supabase_user_id FROM supabase_sessions WHERE user_id = ?')
          .get(user.id) as { supabase_user_id?: string } | undefined;
        return row?.supabase_user_id || undefined;
      } catch {
        return undefined;
      }
    })();
    // ⚠️ Ne PAS redéclarer SUPABASE_URL / SUPABASE_ANON_KEY ici.
    //
    // Deux copies locales sans valeur par défaut vivaient à cet endroit. Elles
    // masquaient les constantes du module — celles qui portent l'adresse du
    // projet — et retombaient sur '' dès que `.env` ne les définissait pas,
    // c'est-à-dire sur toute installation faite d'après `.env.example`, où ces
    // lignes sont commentées. La condition ci-dessous n'était alors jamais
    // vraie : aucun jeton Supabase n'était enregistré, `initUserSync` n'était
    // jamais appelé, et le poste local ne parlait PLUS JAMAIS au cloud. Le
    // téléphone et le PC vivaient chacun de leur côté sans que rien ne le dise.
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const sbRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email: user.email, password }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (sbRes.ok) {
          const sbData = await sbRes.json() as { refresh_token: string; user: { id: string } };
          db.prepare(`
            INSERT INTO supabase_sessions (user_id, supabase_user_id, refresh_token)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              supabase_user_id = excluded.supabase_user_id,
              refresh_token = excluded.refresh_token,
              updated_at = CURRENT_TIMESTAMP
          `).run(user.id, sbData.user.id, sbData.refresh_token);
          cloudUserId = sbData.user.id;
          // Initialise la synchronisation pour cet utilisateur
          void initUserSync(user.id, sbData.user.id, user.email, sbData.refresh_token);
        }
      } catch (err) {
        console.warn(`[authController] Could not sync Supabase login for user ${user.email}:`, err);
      }
    }

    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, cloudUserId } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const supabaseSessionLogin = async (req: Request, res: Response) => {
  const accessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken : '';
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';

  if (!accessToken) {
    return res.status(400).json({ message: 'Supabase access token required' });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const sbRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!sbRes.ok) {
      logAudit({ action: 'LOGIN_FAILED', detail: 'supabase_oauth_invalid_token', ip: req.ip });
      return res.status(401).json({ message: 'Session Google invalide ou expirée.' });
    }

    const sbUser = await sbRes.json() as {
      id?: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    };
    const email = normalizeEmail(sbUser.email || '');
    if (!sbUser.id || !email) {
      return res.status(401).json({ message: 'Session Google sans e-mail vérifié.' });
    }

    const meta = sbUser.user_metadata || {};
    const name =
      typeof meta.name === 'string' ? meta.name :
      typeof meta.full_name === 'string' ? meta.full_name :
      email.split('@')[0];

    let user = db.prepare('SELECT id, email, name, role FROM users WHERE LOWER(TRIM(email)) = ?').get(email) as
      | { id: number; email: string; name: string; role: 'user' | 'admin' }
      | undefined;

    if (!user) {
      const role = localRoleForNewUser(email);
      const lockedPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      const info = db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)').run(email, lockedPassword, name, role);
      user = { id: Number(info.lastInsertRowid), email, name, role };
    } else if (!user.name && name) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);
      user = { ...user, name };
    }

    if (refreshToken) {
      db.prepare(`
        INSERT INTO supabase_sessions (user_id, supabase_user_id, refresh_token)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          supabase_user_id = excluded.supabase_user_id,
          refresh_token = excluded.refresh_token,
          updated_at = CURRENT_TIMESTAMP
      `).run(user.id, sbUser.id, refreshToken);
      void initUserSync(user.id, sbUser.id, user.email, refreshToken);
    }

    logAudit({ userId: user.id, action: 'LOGIN', detail: 'supabase_oauth', ip: req.ip });
    setAuthCookie(res, user);
    return res.json({ user: { ...user, cloudUserId: sbUser.id } });
  } catch (error) {
    console.error('Supabase OAuth login error:', error);
    return res.status(500).json({ message: 'Connexion Google indisponible pour le moment.' });
  }
};

export const logout = (req: Request, res: Response) => {
  logAudit({ userId: (req as any).user?.id, action: 'LOGOUT' });
  res.clearCookie('token', {
    path: '/',
    httpOnly: true,           // not accessible via JS (XSS protection)
    sameSite: cookieSameSite(),       // CSRF protection
    secure: isCookieSecure(), // HTTPS only in production
  });
  res.json({ message: 'Logged out successfully' });
};

export const me = (req: Request, res: Response) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const stmt = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, s.supabase_user_id AS cloudUserId
      FROM users u
      LEFT JOIN supabase_sessions s ON s.user_id = u.id
      WHERE u.id = ?
    `);
    const user = stmt.get(decoded.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const requestPasswordReset = (req: Request, res: Response) => {
  const email = normalizeEmail(req.body.email);

  try {
    const user = db.prepare('SELECT * FROM users WHERE LOWER(TRIM(email)) = ?').get(email);

    if (!user) {
      return res.json({
        message: 'If the email exists, a verification code has been sent',
      });
    }

    // Generate 6-digit code securely
    const code = randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    // Un seul code valide à la fois, et rien qui traîne.
    //
    // Chaque demande ajoutait un code SANS retirer les précédents : douze
    // demandes — ce que la limite de débit autorise en un quart d'heure —
    // laissaient douze codes à six chiffres ouvrant le même compte pendant
    // quinze minutes. Demander un nouveau code doit au contraire invalider
    // l'ancien, comme partout ailleurs. Les codes périmés de tout le monde
    // partent au passage : sans cela la table ne faisait que grossir.
    db.prepare('DELETE FROM verification_codes WHERE LOWER(TRIM(email)) = ? OR expires_at <= ?').run(email, Date.now());
    db.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email, code, expiresAt);

    const allowResetDev =
      process.env.ALLOW_RESET_DEV_CODE === 'true' && process.env.NODE_ENV !== 'production';
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_RESET_LOG_CODE === 'true') {
      console.log(`Verification code for ${email}: ${code}`);
    }

    // Send email using Nodemailer
    const mailOptions = {
      from: `"BERAMETHODE" <${process.env.SMTP_USER || 'no-reply@yourdomain.com'}>`,
      to: email,
      subject: 'Your Verification Code - BERAMETHODE',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #00D37F; margin: 0;">BERAMETHODE</h1>
            <p style="color: #666; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">Industrial Intelligence</p>
          </div>
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <h2 style="color: #333; margin-top: 0;">Password Reset Verification</h2>
            <p style="color: #555; line-height: 1.6;">You requested a password reset for your BERAMETHODE account. Please use the following verification code to complete the process:</p>
            <div style="text-align: center; margin: 30px 0;">
              <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333; background-color: #f0f4f8; padding: 15px 30px; border-radius: 5px; border: 1px solid #d1d5db;">${code}</span>
            </div>
            <p style="color: #555; line-height: 1.6;">This code will expire in 15 minutes.</p>
            <p style="color: #999; font-size: 12px; margin-top: 20px;">If you did not request this code, please ignore this email.</p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #aaa; font-size: 11px;">
            &copy; ${new Date().getFullYear()} BERAMETHODE. All rights reserved.
          </div>
        </div>
      `,
    };

    // Sans messagerie configurée, `sendMail` part quand même vers l'adresse
    // d'exemple (`mail.yourdomain.com`) et échoue après le délai de connexion.
    // On s'en abstient : la réponse dit déjà `emailIndisponible`, et l'écran
    // sait alors orienter la personne vers son administrateur.
    if (!emailConfigure()) {
      console.warn('[auth] Code de réinitialisation non envoyé : SMTP non configuré (voir .env.example).');
    } else {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error sending email:', error);
          // In production, you might want to handle this error more gracefully or retry
        } else {
          console.log('Email sent:', info.response);
        }
      });
    }

    res.json({
      message: 'If the email exists, a verification code has been sent',
      // Le client a besoin de distinguer « e-mail inconnu » (on reste muet,
      // c'est volontaire) de « la messagerie du serveur n'est pas installee »
      // (rien ne partira jamais, il faut le dire).
      emailIndisponible: !emailConfigure(),
      ...(allowResetDev ? { devCode: code } : {}),
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const verifyResetCode = (req: Request, res: Response) => {
  const email = normalizeEmail(req.body.email);
  const { code } = req.body;

  try {
    const record = db.prepare('SELECT * FROM verification_codes WHERE LOWER(TRIM(email)) = ? AND code = ? AND expires_at > ?').get(email, code, Date.now());

    if (!record) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    res.json({ message: 'Code verified' });
  } catch (error) {
    console.error('Code verification error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body.email);
  const { code, newPassword } = req.body;

  try {
    const record = db.prepare('SELECT * FROM verification_codes WHERE LOWER(TRIM(email)) = ? AND code = ? AND expires_at > ?').get(email, code, Date.now());

    if (!record) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Enforce Transaction for data integrity
    const transaction = db.transaction(() => {
      db.prepare('UPDATE users SET password = ? WHERE LOWER(TRIM(email)) = ?').run(hashedPassword, email);
      db.prepare('DELETE FROM verification_codes WHERE LOWER(TRIM(email)) = ?').run(email);
    });
    transaction();

    const user = db.prepare('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?').get(email) as { id: number } | undefined;
    logAudit({ userId: user?.id, action: 'PASSWORD_RESET', detail: email });
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
