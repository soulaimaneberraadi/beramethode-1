import 'dotenv/config';

/**
 * Single source of truth for JWT signing and cookie security flags.
 */
export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error(
      'FATAL: JWT_SECRET must be set in .env (minimum 32 characters). Example: openssl rand -base64 32'
    );
  }
  return s;
}

/** Evaluated once at startup — process exits if JWT_SECRET is missing or too short. */
export const SECRET_KEY = getJwtSecret();
export const JWT_SECRET = SECRET_KEY;

/**
 * Duree de vie d une session, en jours.
 *
 * Elle etait de 24 heures : un ouvrier qui reprend son telephone le lendemain
 * matin devait ressaisir son mot de passe, tous les jours. Sur le terrain, la
 * consequence n est pas plus de securite — c est un mot de passe simple, note
 * quelque part, ou partage.
 *
 * La revocation d appareil (user_devices) est la vraie reponse a un telephone
 * perdu : elle coupe CET appareil tout de suite, sans deranger les autres.
 *
 * Reglable par BERA_SESSION_DAYS pour une entreprise plus exigeante.
 */
export const SESSION_DAYS = Math.max(1, Number(process.env.BERA_SESSION_DAYS) || 30);
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
/** Format attendu par jsonwebtoken (`expiresIn`). */
export const SESSION_EXPIRES_IN = `${SESSION_DAYS}d`;

/**
 * Secure cookies when explicitly requested or in production.
 * Production fallback ensures cookies are never sent over plain HTTP,
 * preventing session hijacking via network sniffing.
 */
export function isCookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

export function shouldUseHelmet(): boolean {
  if (process.env.HELMET === 'true') return true;
  if (process.env.HELMET === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

/**
 * Le site et l API sur deux domaines : le cookie doit porter SameSite=None,
 * sinon le navigateur ne le renvoie jamais et l utilisateur parait deconnecte
 * a chaque requete. « None » impose « Secure » — donc HTTPS des deux cotes.
 *
 * On ne l active QUE sur demande explicite : « strict » reste la protection
 * CSRF par defaut, et on ne l abaisse pas sans raison.
 */
export function cookieSameSite(): "strict" | "none" {
  return process.env.CROSS_SITE === "true" ? "none" : "strict";
}
