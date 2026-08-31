/**
 * Appareils connectés — observation, puis plafond.
 *
 * ── Pourquoi ce module ───────────────────────────────────────────────────────
 * Le serveur signait un jeton de 24h et oubliait aussitôt à qui il l'avait
 * donné. Deux conséquences :
 *
 *  1. Un patron ne pouvait pas savoir qui travaille, ni depuis où.
 *  2. Un téléphone perdu ne pouvait pas être déconnecté sans changer le mot de
 *     passe de son propriétaire — donc en le privant lui aussi d'accès.
 *
 * Et sans mémoire des appareils, rien n'empêche une entreprise de payer cinq
 * comptes et de faire travailler vingt personnes dessus.
 *
 * ── Prudence volontaire ──────────────────────────────────────────────────────
 * Ce module ENREGISTRE. Il ne refuse personne tant que le plafond n'est pas
 * activé, et le plafond est éteint par défaut. Une limite d'accès mal réglée
 * n'est pas un bouton qui ne marche pas : c'est un ouvrier qui ne peut pas
 * travailler. On regarde d'abord, on plafonne ensuite.
 *
 * ── Ce qui compte comme « appareil » ─────────────────────────────────────────
 * Un identifiant tiré au sort et rangé dans l'appareil, envoyé en en-tête
 * `x-bera-device`. Pas une empreinte technique : une empreinte change à chaque
 * mise à jour du navigateur, et ferait passer un habitué pour un inconnu à qui
 * on claque la porte au nez.
 */

import { Request, Response } from 'express';
import db from './db';

/** Longueur/forme acceptée : identifiant opaque produit par le client. */
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export const lireDeviceId = (req: Request): string | null => {
  const brut = req.headers['x-bera-device'];
  const valeur = Array.isArray(brut) ? brut[0] : brut;
  if (!valeur || !DEVICE_ID_RE.test(String(valeur))) return null;
  return String(valeur);
};

/** Étiquette lisible déduite de l'agent utilisateur (« Windows · Chrome »). */
export const etiquetteAppareil = (ua: string): string => {
  const u = String(ua || '');
  const systeme =
    /Android/i.test(u) ? 'Android' :
    /iPhone|iPad|iPod/i.test(u) ? 'iOS' :
    /Windows/i.test(u) ? 'Windows' :
    /Mac OS X|Macintosh/i.test(u) ? 'Mac' :
    /Linux/i.test(u) ? 'Linux' : 'Inconnu';
  // L'ordre compte : Edge et Opera contiennent « Chrome » dans leur agent, et
  // Chrome contient « Safari ». Tester du plus spécifique au plus générique.
  const nav =
    /Edg\//i.test(u) ? 'Edge' :
    /OPR\/|Opera/i.test(u) ? 'Opera' :
    /Chrome\//i.test(u) ? 'Chrome' :
    /Firefox\//i.test(u) ? 'Firefox' :
    /Safari\//i.test(u) ? 'Safari' : '';
  return nav ? `${systeme} · ${nav}` : systeme;
};

/**
 * Note le passage d'un appareil. Appelée à la connexion ET à chaque requête
 * authentifiée (via le middleware), pour que `last_seen_at` reflète l'activité
 * réelle et pas seulement le moment du login.
 *
 * Ne lève jamais : un échec d'écriture ici ne doit pas faire échouer la requête
 * métier qui l'a déclenchée.
 */
export const noterAppareil = (
  userId: number,
  deviceId: string | null,
  req: Request,
): void => {
  if (!deviceId) return;
  try {
    const ua = String(req.headers['user-agent'] || '');
    const ip = String(req.ip ?? req.socket?.remoteAddress ?? '');
    db.prepare(
      `INSERT INTO user_devices (user_id, device_id, label, platform, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, device_id) DO UPDATE SET
         last_seen_at = CURRENT_TIMESTAMP,
         user_agent   = excluded.user_agent,
         ip           = excluded.ip`,
    ).run(userId, deviceId, etiquetteAppareil(ua), etiquetteAppareil(ua).split(' · ')[0], ua, ip);
  } catch (e) {
    console.error('[devices] noterAppareil:', e);
  }
};

/** Un appareil explicitement révoqué ne doit plus passer, même avec un jeton valide. */
export const appareilRevoque = (userId: number, deviceId: string | null): boolean => {
  if (!deviceId) return false;
  try {
    const ligne = db
      .prepare('SELECT revoked_at FROM user_devices WHERE user_id = ? AND device_id = ?')
      .get(userId, deviceId) as { revoked_at: string | null } | undefined;
    return !!ligne?.revoked_at;
  } catch {
    return false;
  }
};

/**
 * GET /api/devices — les appareils de l'utilisateur courant.
 * L'admin d'entreprise passe `?userId=` pour voir ceux d'un membre.
 */
export const listerAppareils = (req: Request, res: Response) => {
  try {
    const moi = (req as any).user?.id as number;
    const demande = req.query.userId ? Number(req.query.userId) : moi;

    // Voir les appareils de quelqu'un d'autre est réservé à l'admin : c'est une
    // information de localisation et d'horaires de travail, pas un détail.
    if (demande !== moi && (req as any).user?.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Reserve a l administrateur' });
    }

    const lignes = db
      .prepare(
        `SELECT id, device_id, label, platform, ip, first_seen_at, last_seen_at, revoked_at
           FROM user_devices
          WHERE user_id = ?
          ORDER BY (revoked_at IS NOT NULL), last_seen_at DESC`,
      )
      .all(demande);

    const courant = lireDeviceId(req);
    res.json({
      ok: true,
      devices: lignes.map((l: any) => ({ ...l, courant: l.device_id === courant })),
    });
  } catch (e) {
    console.error('[devices] listerAppareils:', e);
    res.status(500).json({ ok: false, error: 'Lecture impossible' });
  }
};

/**
 * POST /api/devices/:id/revoke — déconnecte un appareil.
 *
 * Sert au téléphone perdu ou volé : l'accès tombe tout de suite, sans toucher
 * au mot de passe, donc sans priver la personne de son propre accès.
 */
export const revoquerAppareil = (req: Request, res: Response) => {
  try {
    const moi = (req as any).user?.id as number;
    const estAdmin = (req as any).user?.role === 'admin';
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Identifiant invalide' });

    const ligne = db.prepare('SELECT user_id FROM user_devices WHERE id = ?').get(id) as
      | { user_id: number }
      | undefined;
    if (!ligne) return res.status(404).json({ ok: false, error: 'Appareil introuvable' });
    if (ligne.user_id !== moi && !estAdmin) {
      return res.status(403).json({ ok: false, error: 'Reserve a l administrateur' });
    }

    db.prepare('UPDATE user_devices SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[devices] revoquerAppareil:', e);
    res.status(500).json({ ok: false, error: 'Revocation impossible' });
  }
};

/**
 * POST /api/devices/:id/restore — annule une révocation.
 * Le téléphone « perdu » retrouvé au fond d'un sac ne doit pas obliger à
 * recréer un compte.
 */
export const restaurerAppareil = (req: Request, res: Response) => {
  try {
    const moi = (req as any).user?.id as number;
    const estAdmin = (req as any).user?.role === 'admin';
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Identifiant invalide' });

    const ligne = db.prepare('SELECT user_id FROM user_devices WHERE id = ?').get(id) as
      | { user_id: number }
      | undefined;
    if (!ligne) return res.status(404).json({ ok: false, error: 'Appareil introuvable' });
    if (ligne.user_id !== moi && !estAdmin) {
      return res.status(403).json({ ok: false, error: 'Reserve a l administrateur' });
    }

    db.prepare('UPDATE user_devices SET revoked_at = NULL WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[devices] restaurerAppareil:', e);
    res.status(500).json({ ok: false, error: 'Restauration impossible' });
  }
};
