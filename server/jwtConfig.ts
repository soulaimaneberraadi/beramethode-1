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

/** Secure cookies when explicitly requested or in production. */
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
