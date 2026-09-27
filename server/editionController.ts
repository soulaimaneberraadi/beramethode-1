import { Request, Response } from 'express';
import os from 'os';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import db from './db';
import { JWT_SECRET, SESSION_MS, SESSION_EXPIRES_IN } from './jwtConfig';
import { createCompanyAndAdmin } from './setupController';

/**
 * BERACOUPE (BERA_EDITION=coupe) — atelier partagé sur le réseau local, sans
 * inscription ni écran de connexion. Tout ce fichier n'existe que pour cette
 * édition : chaque route commence par vérifier BERA_EDITION, sinon 404 — le
 * comportement BERAMETHODE (édition par défaut) ne doit jamais passer ici.
 */

const ATELIER_EMAIL = 'atelier@beracoupe.local';

function editionActive(): boolean {
  return process.env.BERA_EDITION === 'coupe';
}

function notFound(res: Response) {
  return res.status(404).json({ message: 'Not found' });
}

// ── Adresse privée (garde LAN) ──────────────────────────────────────────────
// Utilisée à la fois par le middleware 403 de server.ts et testée ici en pur.

/** Retire le préfixe IPv4-mappée IPv6 (`::ffff:192.168.1.5` → `192.168.1.5`). */
export function demapper(ip: string): string {
  const mapped = ip.trim().match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  return mapped ? mapped[1] : ip.trim();
}

/** true si `ip` est la boucle locale (127.0.0.1 / ::1 / localhost) — le poste
 *  qui héberge le serveur lui-même. */
export function estLoopback(ip: string): boolean {
  if (!ip) return false;
  const n = demapper(ip);
  return n === '127.0.0.1' || n === '::1' || n === 'localhost';
}

/** true si `ip` est loopback ou une plage privée (10/8, 172.16/12, 192.168/16,
 *  fc00::/7, fe80::/10) — y compris les formes IPv4-mappées `::ffff:`. */
export function estAdressePrivee(ip: string): boolean {
  if (!ip) return false;
  const n = demapper(ip);

  if (estLoopback(n)) return true;

  const m4 = n.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) {
    const a = Number(m4[1]);
    const b = Number(m4[2]);
    if (a === 127) return true; // 127/8 loopback
    if (a === 10) return true; // 10/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    return false;
  }

  const lower = n.toLowerCase();
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 (link-local)
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 (unique-local)
  return false;
}

/** Adresses LAN utilisables pour ouvrir l'atelier depuis un autre poste. */
export function construireAdressesLan(port: number): string[] {
  const nets = os.networkInterfaces();
  const adresses: string[] = [];
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const net of iface) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (net.address.startsWith('169.254.')) continue; // link-local (virtuel/APIPA)
      adresses.push(`http://${net.address}:${port}`);
    }
  }
  return adresses;
}

// ── Cookie de session unique (pas de login) ─────────────────────────────────
// LAN = http en clair : le cookie ne doit JAMAIS être `secure`, sinon le
// navigateur le refuse silencieusement et l'appareil paraît déconnecté à
// chaque requête. sameSite=lax suffit (accès direct même-origine).
function poserCookieEdition(res: Response, user: { id: number; email: string; role: string }): void {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: SESSION_EXPIRES_IN },
  );
  res.cookie('token', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: SESSION_MS,
  });
}

/** Même forme que `/api/auth/me` et le login (id/email/name/role/cloudUserId). */
function chargerUser(userId: number) {
  const stmt = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, s.supabase_user_id AS cloudUserId
    FROM users u
    LEFT JOIN supabase_sessions s ON s.user_id = u.id
    WHERE u.id = ?
  `);
  return stmt.get(userId);
}

function estInitialise(): boolean {
  const row = db
    .prepare('SELECT setup_complete FROM company_settings WHERE id = 1')
    .get() as { setup_complete: number } | undefined;
  return !!(row && row.setup_complete === 1);
}

function nomEntreprise(): string | null {
  const row = db
    .prepare('SELECT name FROM company_settings WHERE id = 1')
    .get() as { name: string | null } | undefined;
  return row?.name ?? null;
}

// ── GET /api/edition ─────────────────────────────────────────────────────
export const getEdition = (_req: Request, res: Response) => {
  if (!editionActive()) return notFound(res);
  const initialise = estInitialise();
  const port = parseInt(process.env.PORT || '7000', 10);
  res.json({
    edition: 'coupe',
    initialise,
    entreprise: initialise ? nomEntreprise() : null,
    port,
    adresses: construireAdressesLan(port),
  });
};

// ── POST /api/edition/setup ──────────────────────────────────────────────
export const postEditionSetup = async (req: Request, res: Response) => {
  if (!editionActive()) return notFound(res);

  const entreprise = typeof req.body?.entreprise === 'string' ? req.body.entreprise.trim() : '';
  if (!entreprise) {
    return res.status(400).json({ message: 'entreprise est requis' });
  }

  if (estInitialise()) {
    return res.status(409).json({ message: 'Déjà initialisé' });
  }

  try {
    // Mot de passe fort généré une seule fois : personne n'a besoin de le
    // connaître, l'atelier entre par /api/edition/session (pas d'écran de
    // connexion). S'il existait déjà (ré-exécution), on le re-signe pareil.
    const motDePasseGenere = randomBytes(24).toString('base64');
    const { userId } = await createCompanyAndAdmin({
      companyName: entreprise,
      adminEmail: ATELIER_EMAIL,
      adminPassword: motDePasseGenere,
      adminName: 'Atelier',
    });

    poserCookieEdition(res, { id: userId, email: ATELIER_EMAIL, role: 'admin' });
    return res.status(201).json({ ok: true, user: chargerUser(userId) });
  } catch (error) {
    console.error('[edition] postEditionSetup error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/edition/session ────────────────────────────────────────────
export const postEditionSession = (_req: Request, res: Response) => {
  if (!editionActive()) return notFound(res);

  if (!estInitialise()) {
    return res.status(409).json({ initialise: false });
  }

  const user = db
    .prepare('SELECT id, email, role FROM users WHERE LOWER(TRIM(email)) = ?')
    .get(ATELIER_EMAIL) as { id: number; email: string; role: string } | undefined;

  if (!user) {
    // company_settings dit "initialisé" mais le compte atelier est introuvable
    // (base modifiée à la main) — on redemande un setup plutôt que de planter.
    return res.status(409).json({ initialise: false });
  }

  poserCookieEdition(res, user);
  return res.json({ ok: true, user: chargerUser(user.id) });
};

// ── Présence des appareils (en mémoire, pas persistée) ──────────────────────

interface Appareil {
  id: string;
  ip: string;
  nom: string;
  navigateur: string;
  vuLe: string; // ISO
  local: boolean;
}

const PRESENCE_TTL_MS = 2 * 60 * 1000;
const appareilsVus = new Map<string, Appareil>();

/** Petit hash déterministe (pas cryptographique) pour distinguer les
 *  navigateurs d'une même IP sans stocker le user-agent complet en clé. */
export function hashCourt(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/** Étiquette courte "Navigateur · OS" à partir d'un User-Agent — même esprit
 *  que ce qu'affiche déjà `devicesController.ts` pour les appareils connus. */
export function labelNavigateur(ua: string): string {
  if (!ua) return 'Appareil inconnu';

  let navigateur = 'Navigateur';
  if (/edg\//i.test(ua)) navigateur = 'Edge';
  else if (/opr\/|opera/i.test(ua)) navigateur = 'Opera';
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) navigateur = 'Chrome';
  else if (/crios\//i.test(ua)) navigateur = 'Chrome';
  else if (/firefox\//i.test(ua)) navigateur = 'Firefox';
  else if (/fxios\//i.test(ua)) navigateur = 'Firefox';
  else if (/safari\//i.test(ua) && /version\//i.test(ua)) navigateur = 'Safari';

  let os_ = 'Appareil';
  if (/windows/i.test(ua)) os_ = 'Windows';
  else if (/iphone/i.test(ua)) os_ = 'iPhone';
  else if (/ipad/i.test(ua)) os_ = 'iPad';
  else if (/mac os x|macintosh/i.test(ua)) os_ = 'Mac';
  else if (/android/i.test(ua)) os_ = 'Android';
  else if (/linux/i.test(ua)) os_ = 'Linux';

  return `${navigateur} · ${os_}`;
}

/** Filtre + tri des appareils "actifs" — pur, testable sans horloge réelle. */
export function appareilsActifs(tous: Appareil[], maintenant: number): Appareil[] {
  return tous
    .filter((a) => maintenant - new Date(a.vuLe).getTime() <= PRESENCE_TTL_MS)
    .sort((a, b) => {
      if (a.local !== b.local) return a.local ? -1 : 1;
      return new Date(b.vuLe).getTime() - new Date(a.vuLe).getTime();
    });
}

// ── POST /api/edition/presence ───────────────────────────────────────────
export const postEditionPresence = (req: Request, res: Response) => {
  if (!editionActive()) return notFound(res);

  // Adresse socket réelle (pas `req.ip`, sensible à X-Forwarded-For — voir la
  // garde réseau de server.ts) : c'est elle qui distingue le poste principal
  // (loopback) des autres appareils du LAN.
  const ip = demapper(req.socket.remoteAddress || 'unknown');
  const ua = String(req.headers['user-agent'] || '');
  const nomFourni = typeof req.body?.appareil === 'string' ? req.body.appareil.trim() : '';
  const navigateur = labelNavigateur(ua);

  const cle = `${ip}|${hashCourt(ua)}`;
  appareilsVus.set(cle, {
    id: cle,
    ip,
    nom: nomFourni || navigateur,
    navigateur,
    vuLe: new Date().toISOString(),
    local: estLoopback(ip),
  });

  return res.json({ ok: true });
};

// ── GET /api/edition/appareils ───────────────────────────────────────────
export const getEditionAppareils = (_req: Request, res: Response) => {
  if (!editionActive()) return notFound(res);

  const actifs = appareilsActifs(Array.from(appareilsVus.values()), Date.now());
  return res.json({ appareils: actifs, total: actifs.length });
};

// Exportés pour les tests uniquement (pas d'API publique voulue dessus).
export const __test__ = { appareilsVus, PRESENCE_TTL_MS };
