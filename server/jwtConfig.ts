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
