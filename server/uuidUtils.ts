import crypto from 'crypto';

export function generateUUID(): string {
  return crypto.randomUUID();
}

export function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

export function isValidSafeId(str: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(str) && str.length > 0 && str.length <= 64;
}
